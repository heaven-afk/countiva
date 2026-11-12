begin;
-- Requires 006 and 007. Each grant produces one durable notice per current member.
do $$ begin
 if to_regclass('public.subscription_access_grants') is null then
  raise exception 'Apply migrations 006 and 007 successfully before 009_trial_notifications.sql';
 end if;
end $$;

create table public.business_notifications (
 id uuid primary key default gen_random_uuid(),
 business_id uuid not null references public.businesses(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 grant_id uuid not null references public.subscription_access_grants(id) on delete cascade,
 title text not null, business_name text not null, expires_at timestamptz not null,
 created_at timestamptz not null default now(), read_at timestamptz,
 unique(grant_id,user_id)
);
create index business_notifications_inbox on public.business_notifications(business_id,user_id,created_at desc);
alter table public.business_notifications enable row level security;
revoke all on public.business_notifications from public,anon,authenticated;
grant all on public.business_notifications to service_role;

create function public.notify_growth_trial() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if new.kind='trial' and new.tier='growth' and new.revoked_at is null and new.ends_at>now() then
  insert into public.business_notifications(business_id,user_id,grant_id,title,business_name,expires_at)
  select new.business_id,m.user_id,new.id,'Your free Growth trial is ready',b.name,new.ends_at
  from public.memberships m join public.businesses b on b.id=m.business_id
  where m.business_id=new.business_id
  on conflict(grant_id,user_id) do nothing;
 end if;
 return new;
end;$$;
revoke all on function public.notify_growth_trial() from public,anon,authenticated;
create trigger growth_trial_notification after insert on public.subscription_access_grants
 for each row execute function public.notify_growth_trial();

-- Existing active trials receive one notice when this upgrade is installed.
insert into public.business_notifications(business_id,user_id,grant_id,title,business_name,expires_at,created_at)
select g.business_id,m.user_id,g.id,'Your free Growth trial is ready',b.name,g.ends_at,g.created_at
from public.subscription_access_grants g join public.memberships m on m.business_id=g.business_id
join public.businesses b on b.id=g.business_id
where g.kind='trial' and g.revoked_at is null and g.starts_at<=now() and g.ends_at>now()
on conflict(grant_id,user_id) do nothing;

create function public.list_business_notifications(bid uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare result jsonb; unread integer;
begin
 if auth.uid() is null or not public.is_member(bid) then raise exception 'Workspace access denied';end if;
 select count(*) into unread from public.business_notifications where business_id=bid and user_id=auth.uid() and read_at is null;
 select coalesce(jsonb_agg(to_jsonb(n) order by (n."readAt" is null) desc,n."createdAt" desc,n.id),'[]'::jsonb) into result from (
  select n.id,n.title,n.business_name as "businessName",n.expires_at as "expiresAt",n.created_at as "createdAt",n.read_at as "readAt",g.revoked_at as "revokedAt"
  from public.business_notifications n join public.subscription_access_grants g on g.id=n.grant_id
  where n.business_id=bid and n.user_id=auth.uid()
  order by (n.read_at is null) desc,n.created_at desc,n.id limit 50
 ) n;
 return jsonb_build_object('notifications',result,'unreadCount',unread);
end;$$;
create function public.read_business_notification(bid uuid,notification_ref uuid) returns void language plpgsql security definer set search_path=public as $$
begin
 if auth.uid() is null or not public.is_member(bid) then raise exception 'Workspace access denied';end if;
 update public.business_notifications set read_at=coalesce(read_at,now())
 where id=notification_ref and business_id=bid and user_id=auth.uid();
 if not found then raise exception 'Notification not found';end if;
end;$$;
revoke all on function public.list_business_notifications(uuid),public.read_business_notification(uuid,uuid) from public,anon,authenticated;
grant execute on function public.list_business_notifications(uuid),public.read_business_notification(uuid,uuid) to authenticated;
notify pgrst,'reload schema';
commit;
