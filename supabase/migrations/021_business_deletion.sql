begin;
-- Only explicit owner/admin RPCs may permanently delete a business.
create table public.business_deletion_events (
 id uuid primary key default gen_random_uuid(),business_id uuid not null,business_name text not null,
 actor_id uuid not null,owner_id uuid not null,actor_kind text not null check(actor_kind in ('owner','admin')),
 reason text,deleted_at timestamptz not null default now()
);
create table public.deleted_business_checkouts (
 checkout_id text primary key,deletion_id uuid not null references business_deletion_events(id)
);
alter table public.business_deletion_events enable row level security;
alter table public.deleted_business_checkouts enable row level security;
revoke all on public.business_deletion_events,public.deleted_business_checkouts from public,anon,authenticated;
grant all on public.business_deletion_events,public.deleted_business_checkouts to service_role;

-- Keep the owner's used-trial claim so deleting a business cannot restart a trial.
alter table public.new_owner_trial_claims alter column business_id drop not null;
alter table public.new_owner_trial_claims drop constraint new_owner_trial_claims_business_id_fkey;
alter table public.new_owner_trial_claims add constraint new_owner_trial_claims_business_id_fkey foreign key(business_id) references businesses(id) on delete set null;
alter table public.new_owner_trial_claims drop constraint new_owner_trial_claims_grant_id_fkey;
alter table public.new_owner_trial_claims add constraint new_owner_trial_claims_grant_id_fkey foreign key(grant_id) references subscription_access_grants(id) on delete set null;

-- Deletion is a single statement/transaction; all business-scoped records follow it.
do $$ declare link record; definition text;
begin
 for link in select c.conrelid::regclass tab,c.conname,pg_get_constraintdef(c.oid) definition from pg_constraint c
  join pg_class t on t.oid=c.conrelid join pg_namespace n on n.oid=t.relnamespace
  where c.contype='f' and n.nspname='public' and c.confrelid='public.businesses'::regclass and c.conrelid<>'public.new_owner_trial_claims'::regclass
 loop
  definition:=regexp_replace(link.definition,' ON DELETE (NO ACTION|RESTRICT|CASCADE|SET NULL|SET DEFAULT)','');
  execute format('alter table %s drop constraint %I',link.tab,link.conname);
  execute format('alter table %s add constraint %I %s ON DELETE CASCADE',link.tab,link.conname,definition);
 end loop;
 for link in select c.conrelid::regclass tab,c.conname,pg_get_constraintdef(c.oid) definition from pg_constraint c
  where c.contype='f' and ((c.conrelid='public.billing_events'::regclass and c.confrelid='public.billing_orders'::regclass)
  or (c.conrelid in ('public.business_push_deliveries'::regclass,'public.business_push_device_receipts'::regclass) and c.confrelid='public.business_push_events'::regclass)
  or (c.conrelid='public.stock_alert_states'::regclass and c.confrelid='public.products'::regclass))
 loop
  definition:=regexp_replace(link.definition,' ON DELETE (NO ACTION|RESTRICT|CASCADE|SET NULL|SET DEFAULT)','');
  execute format('alter table %s drop constraint %I',link.tab,link.conname);
  execute format('alter table %s add constraint %I %s ON DELETE CASCADE',link.tab,link.conname,definition);
 end loop;
end;$$;
revoke delete on public.businesses from anon,authenticated;

create function public.perform_business_deletion(bid uuid,confirmation_name text,permanent boolean,actor_kind text,deletion_reason text) returns uuid
language plpgsql security definer set search_path=public as $$
declare target businesses; event_ref uuid;
begin
 select * into target from businesses where id=bid for update;
 if target.id is null then raise exception 'This business no longer exists';end if;
 if permanent is distinct from true or confirmation_name is distinct from target.name then raise exception 'Type the exact business name and confirm permanent deletion';end if;
 if exists(select 1 from billing_orders where business_id=bid and status='pending' and created_at>now()-interval '30 minutes') then raise exception 'A payment checkout is still pending. Wait for it to complete or expire before deleting this business';end if;
 insert into business_deletion_events(business_id,business_name,actor_id,owner_id,actor_kind,reason)
 values(bid,target.name,auth.uid(),target.owner_id,actor_kind,deletion_reason) returning id into event_ref;
 insert into platform_audit(actor_id,action,target_user) values(auth.uid(),'business_deleted_'||actor_kind,target.owner_id);
 insert into deleted_business_checkouts(checkout_id,deletion_id) select checkout_id,event_ref from billing_orders where business_id=bid and checkout_id is not null on conflict do nothing;
 -- Composite inventory references are checked immediately; remove their leaves first.
 delete from payments where business_id=bid;
 delete from receipt_edit_audit where business_id=bid;
 delete from sale_items where business_id=bid;
 delete from sales where business_id=bid;
 delete from stock_movements where business_id=bid;
 delete from stock_alert_states where business_id=bid;
 delete from products where business_id=bid;
 delete from analytics_reports where business_id=bid;
 delete from subscription_terms where business_id=bid;
 delete from billing_orders where business_id=bid;
 delete from businesses where id=bid;
 return event_ref;
end;$$;
create function public.delete_business(bid uuid,confirmation_name text,permanent boolean) returns uuid
language plpgsql security definer set search_path=public as $$
begin
 if auth.uid() is null or not exists(select 1 from businesses where id=bid and owner_id=auth.uid()) then raise exception 'Only the business owner can delete this business';end if;
 return perform_business_deletion(bid,confirmation_name,permanent,'owner',null);
end;$$;
create function public.platform_delete_business(bid uuid,confirmation_name text,permanent boolean,deletion_reason text) returns uuid
language plpgsql security definer set search_path=public as $$
begin
 if coalesce(platform_access(),'') not in ('owner','admin') then raise exception 'Platform owner or administrator required';end if;
 if deletion_reason is null or length(trim(deletion_reason)) not between 10 and 500 then raise exception 'Record a deletion reason between 10 and 500 characters';end if;
 return perform_business_deletion(bid,confirmation_name,permanent,'admin',trim(deletion_reason));
end;$$;
create function public.is_deleted_business_checkout(checkout_ref text) returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from deleted_business_checkouts where checkout_id=checkout_ref)
$$;
revoke all on function public.perform_business_deletion(uuid,text,boolean,text,text),public.delete_business(uuid,text,boolean),public.platform_delete_business(uuid,text,boolean,text),public.is_deleted_business_checkout(text) from public,anon,authenticated;
grant execute on function public.delete_business(uuid,text,boolean),public.platform_delete_business(uuid,text,boolean,text) to authenticated;
grant execute on function public.is_deleted_business_checkout(text) to service_role;
notify pgrst,'reload schema';
commit;
