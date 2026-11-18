-- Detailed analytics are included in every active subscription (including trials).
-- Existing paid orders and snapshots are retained, never rewritten or refunded here.
begin;
update public.billing_catalog set enabled=false where code='analytics-report';
alter table public.analytics_reports alter column order_id drop not null;
alter table public.analytics_reports add column report_day date;
alter table public.analytics_reports add column period_days integer check(period_days in (7,30,90));
alter table public.analytics_reports add constraint included_report_identity check
 ((order_id is not null and report_day is null) or (order_id is null and report_day is not null and period_days is not null));
create unique index included_report_daily on public.analytics_reports(business_id,report_day,period_days) where order_id is null;

create function public.reserve_included_report(bid uuid,days integer) returns jsonb
language plpgsql security definer set search_path=public as $$
declare saved analytics_reports; today date:=(now() at time zone 'Africa/Lagos')::date;
begin
 if coalesce(business_role(bid),'') not in ('owner','manager') then raise exception 'Only an owner or manager can prepare a detailed report'; end if;
 if not coalesce((business_entitlements(bid)->>'hasAccess')::boolean,false) then raise exception 'An active subscription or trial is required'; end if;
 if days is null or days not in (7,30,90) then raise exception 'Choose 7, 30 or 90 days'; end if;
 insert into analytics_reports(business_id,report_day,period_days) values(bid,today,days) on conflict do nothing;
 select * into saved from analytics_reports where business_id=bid and order_id is null and report_day=today and period_days=days for update;
 if saved.status='ready' then return jsonb_build_object('ready',true,'reportId',saved.id,'report',saved.report); end if;
 if saved.status='processing' and saved.processing_at>now()-interval '5 minutes' then raise exception 'This report is already being prepared. Try again shortly'; end if;
 update analytics_reports set status='processing',processing_at=now() where id=saved.id;
 return jsonb_build_object('ready',false,'reportId',saved.id,'snapshot',sync_workspace(bid,'{"products":[],"movements":[],"sales":[],"payments":[]}'::jsonb));
end;$$;

create or replace function public.complete_business_report(bid uuid,report_id uuid,report_data jsonb) returns void
language plpgsql security definer set search_path=public as $$
begin
 if not exists(select 1 from analytics_reports r left join billing_orders o on o.id=r.order_id
   where r.id=report_id and r.business_id=bid and (r.order_id is null or o.status='paid')) then raise exception 'Report not found'; end if;
 if not exists(select 1 from analytics_reports r where r.id=report_id and r.business_id=bid and
   (r.period_days is null or (report_data->>'days')::integer=r.period_days)) then raise exception 'Report period does not match'; end if;
 update analytics_reports set status='ready',report=report_data,generated_at=now() where id=report_id and business_id=bid and status='processing';
end;$$;

create or replace function public.list_business_reports(bid uuid) returns jsonb
language plpgsql stable security definer set search_path=public as $$
begin
 if not is_member(bid) then raise exception 'Workspace access denied'; end if;
 return coalesce((select jsonb_agg(item order by stamp desc) from (
   select jsonb_build_object('id',r.id,'status',r.status,'generatedAt',r.generated_at,'days',r.period_days,
     'metrics',case when r.status='ready' then r.report->'metrics' else null end) item,
     coalesce(r.generated_at,r.processing_at,o.created_at) stamp
   from analytics_reports r left join billing_orders o on o.id=r.order_id where r.business_id=bid and
     (o.status='paid' or (r.order_id is null and coalesce((business_entitlements(bid)->>'hasAccess')::boolean,false)))
   order by stamp desc limit 100
 ) recent),'[]'::jsonb);
end;$$;

create or replace function public.get_business_report(bid uuid,report_id uuid) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare body jsonb;
begin
 if not is_member(bid) then raise exception 'Workspace access denied'; end if;
 select r.report into body from analytics_reports r left join billing_orders o on o.id=r.order_id
 where r.id=report_id and r.business_id=bid and r.status='ready' and
   (o.status='paid' or (r.order_id is null and coalesce((business_entitlements(bid)->>'hasAccess')::boolean,false)));
 if body is null then raise exception 'This report is unavailable. Check your subscription and try again'; end if;
 return body;
end;$$;
revoke all on function public.reserve_included_report(uuid,integer) from public,anon,authenticated;
grant execute on function public.reserve_included_report(uuid,integer) to authenticated;
-- Replacements retain the original grants: completion remains service-role only.
notify pgrst,'reload schema';
commit;
