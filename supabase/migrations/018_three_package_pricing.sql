begin;
-- Apply after 001–017. Historical orders, grants and paid periods keep snapshots.
do $$ begin
 if to_regclass('public.platform_trial_settings') is null then
  raise exception 'Apply migration 015, then 016 and 017 before 018';
 end if;
end $$;
create function public.package_limits(package_tier text) returns jsonb language sql immutable set search_path=public as $$
 select case package_tier
 when 'starter' then '{"members":1,"analytics":"none","templates":["classic","minimal"],"scans":10,"scanItems":10}'::jsonb
 when 'growth' then '{"members":3,"analytics":"growth","templates":["classic","minimal","ledger","bold"],"scans":30,"scanItems":20}'::jsonb
 when 'business' then '{"members":6,"analytics":"business","templates":["classic","minimal","ledger","bold"],"scans":100,"scanItems":40}'::jsonb
 else null end
$$;
create function public.legacy_package_limits(package_tier text) returns jsonb language sql immutable set search_path=public as $$
 select case when package_tier='growth' then '{"members":6,"analytics":"business","templates":["classic","minimal","ledger","bold"],"scans":100,"scanItems":40}'::jsonb
 else '{"members":3,"analytics":"none","templates":["classic","minimal"],"scans":20,"scanItems":10}'::jsonb end
$$;
alter table public.billing_catalog drop constraint billing_catalog_tier_check;
alter table public.billing_catalog add constraint billing_catalog_tier_check check(tier in ('starter','growth','business'));
alter table public.billing_orders drop constraint billing_orders_tier_check;
alter table public.billing_orders add constraint billing_orders_tier_check check(tier in ('starter','growth','business'));
alter table public.subscription_terms drop constraint subscription_terms_tier_check;
alter table public.subscription_terms add constraint subscription_terms_tier_check check(tier in ('starter','growth','business'));
alter table public.subscription_access_grants drop constraint subscription_access_grants_tier_check;
alter table public.subscription_access_grants add constraint subscription_access_grants_tier_check check(tier in ('starter','growth','business'));
alter table public.billing_orders add column capacity_snapshot jsonb;
alter table public.subscription_terms add column capacity_snapshot jsonb;
alter table public.subscription_access_grants add column capacity_snapshot jsonb;
update billing_orders set capacity_snapshot=public.legacy_package_limits(tier) where tier is not null;
update subscription_terms set capacity_snapshot=public.legacy_package_limits(tier);
update subscription_access_grants set capacity_snapshot=public.legacy_package_limits(tier);
create function public.snapshot_package_capacity() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if tg_table_name='subscription_terms' then
  select capacity_snapshot into new.capacity_snapshot from billing_orders where id=new.order_id;
 else new.capacity_snapshot:=public.package_limits(new.tier);end if;
 return new;
end;$$;
create trigger order_package_capacity before insert on billing_orders for each row execute function snapshot_package_capacity();
create trigger term_package_capacity before insert on subscription_terms for each row execute function snapshot_package_capacity();
create trigger grant_package_capacity before insert on subscription_access_grants for each row execute function snapshot_package_capacity();
update billing_catalog set enabled=false,revision=revision+1 where code in ('growth-quarter','growth-halfyear');
insert into billing_catalog(code,name,tier,category,months,amount) values
 ('starter-monthly','Starter','starter','monthly',1,500000),
 ('growth-monthly','Growth','growth','monthly',1,1500000),
 ('business-monthly','Business','business','monthly',1,3000000),
 ('starter-year','Starter','starter','annual',12,5000000),
 ('growth-year','Growth','growth','annual',12,15000000),
 ('business-year','Business','business','annual',12,30000000)
on conflict(code) do update set name=excluded.name,tier=excluded.tier,category=excluded.category,months=excluded.months,amount=excluded.amount,enabled=true,revision=billing_catalog.revision+1;
create or replace function public.business_subscription_state(bid uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare term subscription_terms; upcoming subscription_terms; access_grant subscription_access_grants; control business_subscription_controls;
 tier_name text:='starter';source_name text:='none';access_status text:='inactive';eligible boolean:=false;expiry timestamptz;used integer;cap integer;limits jsonb;future_limits jsonb;
begin
 select * into term from subscription_terms where business_id=bid and revoked_at is null and starts_at<=now() and ends_at>now() order by ends_at desc limit 1;
 select * into upcoming from subscription_terms where business_id=bid and revoked_at is null and starts_at>now() order by starts_at limit 1;
 select * into access_grant from subscription_access_grants where business_id=bid and revoked_at is null and starts_at<=now() and ends_at>now() order by created_at desc,id desc limit 1;
 select * into control from business_subscription_controls where business_id=bid;
 if term.id is not null then tier_name:=term.tier;eligible:=true;expiry:=term.ends_at;source_name:='payment';access_status:='active';
 elsif exists(select 1 from legacy_billing_access where business_id=bid) then eligible:=true;source_name:='legacy';access_status:='legacy';end if;
 if access_grant.id is not null then tier_name:=access_grant.tier;eligible:=true;expiry:=access_grant.ends_at;source_name:=access_grant.kind;access_status:=case when access_grant.kind='trial' then 'trial' else 'active' end;end if;
 if control.paused_at is not null then access_status:='paused';end if;
 select count(*) into used from stock_scan_requests where business_id=bid and usage_month=date_trunc('month',now() at time zone 'Africa/Lagos')::date and status<>'failed';
 limits:=public.package_limits(tier_name);
 if source_name='payment' then limits:=coalesce(term.capacity_snapshot,limits);
 elsif source_name in ('trial','manual') then limits:=coalesce(access_grant.capacity_snapshot,limits);
 elsif source_name='legacy' then limits:=public.legacy_package_limits(tier_name);end if;
 cap:=(limits->>'members')::integer;
 if upcoming.id is not null then cap:=least(cap,(coalesce(upcoming.capacity_snapshot,public.package_limits(upcoming.tier))->>'members')::integer);end if;
 for future_limits in select coalesce(capacity_snapshot,public.package_limits(tier)) from billing_orders where business_id=bid and tier is not null and status='pending' and created_at>now()-interval '30 minutes' loop
 cap:=least(cap,(future_limits->>'members')::integer);end loop;
 return jsonb_build_object('tier',tier_name,'status',access_status,'source',source_name,'hasAccess',eligible and control.paused_at is null,'eligible',eligible,
 'maxMembers',cap,'receiptTemplates',limits->'templates',
 'scanLimit',(limits->>'scans')::integer,'scanItems',(limits->>'scanItems')::integer,'scansUsed',used,
 'currentOffer',term.offer_code,'expiresAt',expiry,'paidExpiresAt',term.ends_at,'nextOffer',upcoming.offer_code,'nextStartsAt',upcoming.starts_at,'pausedAt',control.paused_at);
end;$$;

create or replace function public.platform_manage_subscription(bid uuid,action_name text,details jsonb) returns jsonb language plpgsql security definer set search_path=public as $$
declare access_role text;reason_text text;target_tier text;until_at timestamptz;request_ref uuid;prior subscription_admin_events;before_state jsonb;after_state jsonb;owner_user uuid;seats integer;
begin
 access_role:=platform_access();
 if access_role is null or access_role not in ('owner','admin') then raise exception 'Platform owner or admin access required to manage subscriptions';end if;
 if action_name is null or action_name not in ('pause','resume','trial','activate','end_grant') then raise exception 'Invalid subscription action';end if;
 if jsonb_typeof(details) is distinct from 'object' or octet_length(details::text)>6000 then raise exception 'Invalid subscription details';end if;
 reason_text:=trim(details->>'reason');request_ref:=nullif(details->>'requestId','')::uuid;
 if reason_text is null or length(reason_text) not between 5 and 500 then raise exception 'Give a reason between 5 and 500 characters';end if;
 if request_ref is null then raise exception 'A request reference is required';end if;
 select owner_id into owner_user from businesses where id=bid for update;
 if owner_user is null then raise exception 'Business not found';end if;
 select * into prior from subscription_admin_events where request_id=request_ref;
 if prior.id is not null then
  if prior.business_id<>bid or prior.actor_id<>auth.uid() or prior.action<>action_name or prior.payload is distinct from details then raise exception 'This request reference was already used for another change';end if;
  return business_subscription_state(bid);
 end if;
 before_state:=business_subscription_state(bid);
 if action_name in ('trial','activate') then
  target_tier:=case when action_name='trial' then 'growth' else details->>'tier' end;
  if target_tier is null or target_tier not in ('starter','growth','business') then raise exception 'Choose Starter, Growth or Business';end if;
  until_at:=(details->>'expiresAt')::timestamptz;
  if until_at is null or until_at<=now()+interval '5 minutes' or until_at>now()+interval '366 days' then raise exception 'Choose an expiry between five minutes and one year from now';end if;
  select count(*) into seats from memberships where business_id=bid;
  seats:=seats+(select count(*) from staff_invitations where business_id=bid and accepted_at is null and revoked_at is null and expires_at>now());
  if seats>(public.package_limits(target_tier)->>'members')::integer then raise exception 'This package cannot fit the current team and pending invitations. Remove extra staff or choose a larger package';end if;
  update subscription_access_grants set revoked_at=now() where business_id=bid and revoked_at is null;
  insert into subscription_access_grants(business_id,kind,tier,ends_at,created_by,reason) values(bid,case when action_name='trial' then 'trial' else 'manual' end,target_tier,until_at,auth.uid(),reason_text);
  delete from legacy_billing_access where business_id=bid;
  insert into business_subscription_controls(business_id) values(bid) on conflict(business_id) do update set paused_at=null,paused_by=null,pause_reason='',updated_at=now();
 elsif action_name='pause' then
  insert into business_subscription_controls(business_id,paused_at,paused_by,pause_reason) values(bid,now(),auth.uid(),reason_text) on conflict(business_id) do update set paused_at=coalesce(business_subscription_controls.paused_at,now()),paused_by=auth.uid(),pause_reason=excluded.pause_reason,updated_at=now();
 elsif action_name='resume' then
  if not (before_state->>'eligible')::boolean then raise exception 'This access period has ended. Activate a new period or grant a Growth trial';end if;
  update business_subscription_controls set paused_at=null,paused_by=null,pause_reason='',updated_at=now() where business_id=bid;
 else
  if not exists(select 1 from subscription_access_grants where business_id=bid and revoked_at is null and ends_at>now()) then raise exception 'There is no current trial or manual activation to end';end if;
  update subscription_access_grants set revoked_at=now() where business_id=bid and revoked_at is null;
 end if;
 after_state:=business_subscription_state(bid);
 insert into subscription_admin_events(request_id,business_id,actor_id,action,reason,payload,previous_state,next_state) values(request_ref,bid,auth.uid(),action_name,reason_text,details,before_state,after_state);
 insert into platform_audit(actor_id,action,target_user) values(auth.uid(),'subscription_'||action_name,owner_user);
 return after_state;
end;$$;

-- The public purchase entry point checks capacity before the older billing core.
create or replace function public.create_plan_order(bid uuid,product_code text,quoted_amount bigint) returns jsonb language plpgsql security definer set search_path=public as $$
declare current_amount bigint;target_tier text;seats integer;placed jsonb;
begin
 if business_role(bid) is distinct from 'owner' then raise exception 'Only the business owner can purchase a plan';end if;
 perform 1 from businesses where id=bid for update;
 select amount,tier into current_amount,target_tier from billing_catalog where code=product_code and enabled and category in ('monthly','annual') for share;
 if current_amount is null then raise exception 'This plan is unavailable. Refresh the plan list';end if;
 if quoted_amount is distinct from current_amount then raise exception 'The plan price has changed. Refresh and review the latest price before checkout';end if;
 select count(*) into seats from memberships where business_id=bid;
 seats:=seats+(select count(*) from staff_invitations where business_id=bid and accepted_at is null and revoked_at is null and expires_at>now());
 if seats>(public.package_limits(target_tier)->>'members')::integer then raise exception 'This package cannot fit your team and pending invitations. Remove extra staff or choose a larger package';end if;
 placed:=create_billing_order(bid,product_code);
 if (placed->>'amount')::bigint is distinct from quoted_amount then raise exception 'An earlier checkout is still open at a different price. Wait for it to expire before starting another';end if;
 return placed;
end;$$;
-- Legacy callers use the same capacity check, including direct RPC checkout.
alter function public.create_billing_order(uuid,text) rename to create_billing_order_v3;
revoke all on function public.create_billing_order_v3(uuid,text) from public,anon,authenticated;
create function public.create_billing_order(bid uuid,product_code text) returns jsonb language plpgsql security definer set search_path=public as $$
declare seats integer;target_tier text;
begin
 if business_role(bid) is distinct from 'owner' then raise exception 'Only the business owner can purchase a plan';end if;
 perform 1 from businesses where id=bid for update;
 select tier into target_tier from billing_catalog where code=product_code and enabled;
 if target_tier is not null then
  select count(*) into seats from memberships where business_id=bid;
  seats:=seats+(select count(*) from staff_invitations where business_id=bid and accepted_at is null and revoked_at is null and expires_at>now());
  if seats>(public.package_limits(target_tier)->>'members')::integer then raise exception 'This package cannot fit your team and pending invitations';end if;
 end if;
 return create_billing_order_v3(bid,product_code);
end;$$;
revoke all on function public.create_billing_order(uuid,text) from public,anon;
grant execute on function public.create_billing_order(uuid,text) to authenticated;
revoke all on function public.snapshot_package_capacity() from public,anon,authenticated;
notify pgrst,'reload schema';
commit;
