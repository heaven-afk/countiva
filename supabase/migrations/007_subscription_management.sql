begin;
-- Apply after 006. Manual access never changes verified Bachs payments.
create table public.business_subscription_controls (
 business_id uuid primary key references businesses(id),paused_at timestamptz,
 paused_by uuid references auth.users(id),pause_reason text not null default '',updated_at timestamptz not null default now()
);
create table public.subscription_access_grants (
 id uuid primary key default gen_random_uuid(),business_id uuid not null references businesses(id),
 kind text not null check(kind in ('trial','manual')),tier text not null check(tier in ('starter','growth')),
 starts_at timestamptz not null default now(),ends_at timestamptz not null,revoked_at timestamptz,
 created_by uuid not null references auth.users(id),reason text not null check(length(reason) between 5 and 500),created_at timestamptz not null default now(),
 check(ends_at>starts_at),check(kind<>'trial' or tier='growth')
);
create index subscription_access_grants_business on subscription_access_grants(business_id,ends_at) where revoked_at is null;
create table public.subscription_admin_events (
 id uuid primary key default gen_random_uuid(),request_id uuid not null unique,
 business_id uuid not null references businesses(id),actor_id uuid not null references auth.users(id),
 action text not null check(action in ('pause','resume','trial','activate','end_grant')),
 reason text not null check(length(reason) between 5 and 500),payload jsonb not null,
 previous_state jsonb not null,next_state jsonb not null,created_at timestamptz not null default now()
);
create index subscription_admin_events_business on subscription_admin_events(business_id,created_at desc);
alter table business_subscription_controls enable row level security;
alter table subscription_access_grants enable row level security;
alter table subscription_admin_events enable row level security;
revoke all on business_subscription_controls,subscription_access_grants,subscription_admin_events from public,anon,authenticated;
grant all on business_subscription_controls,subscription_access_grants,subscription_admin_events to service_role;

-- Private shared calculation for members, admins, joining users and reminders.
create function public.business_subscription_state(bid uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare term subscription_terms; upcoming subscription_terms; access_grant subscription_access_grants; control business_subscription_controls;
 tier_name text:='starter';source_name text:='none';access_status text:='inactive';eligible boolean:=false;expiry timestamptz;used integer;cap integer;
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
 cap:=case when tier_name='growth' then 6 else 3 end;
 if upcoming.tier='starter' or exists(select 1 from billing_orders where business_id=bid and tier='starter' and status='pending' and created_at>now()-interval '30 minutes') then cap:=least(cap,3);end if;
 return jsonb_build_object('tier',tier_name,'status',access_status,'source',source_name,'hasAccess',eligible and control.paused_at is null,'eligible',eligible,
 'maxMembers',cap,'receiptTemplates',case when tier_name='growth' then '["classic","minimal","ledger","bold"]'::jsonb else '["classic","minimal"]'::jsonb end,
 'scanLimit',case when tier_name='growth' then 100 else 20 end,'scanItems',case when tier_name='growth' then 40 else 10 end,'scansUsed',used,
 'currentOffer',term.offer_code,'expiresAt',expiry,'paidExpiresAt',term.ends_at,'nextOffer',upcoming.offer_code,'nextStartsAt',upcoming.starts_at,'pausedAt',control.paused_at);
end;$$;
revoke all on function public.business_subscription_state(uuid) from public,anon,authenticated;
create or replace function public.business_entitlements(bid uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
begin
 if not is_member(bid) then raise exception 'Workspace access denied';end if;
 return business_subscription_state(bid);
end;$$;

create function public.platform_manage_subscription(bid uuid,action_name text,details jsonb) returns jsonb language plpgsql security definer set search_path=public as $$
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
  if target_tier is null or target_tier not in ('starter','growth') then raise exception 'Choose Starter or Growth';end if;
  until_at:=(details->>'expiresAt')::timestamptz;
  if until_at is null or until_at<=now()+interval '5 minutes' or until_at>now()+interval '366 days' then raise exception 'Choose an expiry between five minutes and one year from now';end if;
  select count(*) into seats from memberships where business_id=bid;
  seats:=seats+(select count(*) from staff_invitations where business_id=bid and accepted_at is null and revoked_at is null and expires_at>now());
  if target_tier='starter' and seats>3 then raise exception 'Starter allows the owner and two other users, including pending invitations';end if;
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

create function public.platform_subscriptions(search_text text default '',status_filter text default 'all',offset_rows integer default 0,page_size integer default 25) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare result jsonb;matches bigint;q text:=trim(coalesce(search_text,''));
begin
 if platform_access() is null then raise exception 'Platform administrator access required';end if;
 if length(q)>200 or offset_rows is null or offset_rows not between 0 and 1000000 or page_size is null or page_size not between 1 and 100 then raise exception 'Invalid subscription search or page';end if;
 if status_filter is null or status_filter not in ('all','active','trial','paused','inactive','legacy') then raise exception 'Invalid subscription status';end if;
 select count(*) into matches from businesses b join auth.users u on u.id=b.owner_id where (q='' or b.name ilike '%'||q||'%' or u.email ilike '%'||q||'%' or b.id::text=q) and (status_filter='all' or business_subscription_state(b.id)->>'status'=status_filter);
 select coalesce(jsonb_agg(x.body order by x.created_at desc,x.id),'[]'::jsonb) into result from (
  select b.id,b.created_at,jsonb_build_object('id',b.id,'name',b.name,'ownerEmail',u.email,'members',(select count(*) from memberships m where m.business_id=b.id),'access',business_subscription_state(b.id),
  'lastPayment',(select jsonb_build_object('amount',o.amount,'paidAt',o.paid_at,'offerCode',o.offer_code) from billing_orders o where o.business_id=b.id and o.status='paid' and o.months>0 order by o.paid_at desc limit 1)) body
  from businesses b join auth.users u on u.id=b.owner_id where (q='' or b.name ilike '%'||q||'%' or u.email ilike '%'||q||'%' or b.id::text=q) and (status_filter='all' or business_subscription_state(b.id)->>'status'=status_filter)
  order by b.created_at desc,b.id offset offset_rows limit page_size
 )x;
 return jsonb_build_object('businesses',result,'total',matches,'offset',offset_rows,'pageSize',page_size);
end;$$;
create function public.platform_subscription_history(bid uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
begin
 if platform_access() is null then raise exception 'Platform administrator access required';end if;
 if not exists(select 1 from businesses where id=bid) then raise exception 'Business not found';end if;
 return jsonb_build_object('events',coalesce((select jsonb_agg(x.body order by x.created_at desc) from (select e.created_at,jsonb_build_object('id',e.id,'action',e.action,'reason',e.reason,'actorEmail',u.email,'createdAt',e.created_at,'tier',e.next_state->>'tier','expiresAt',e.next_state->>'expiresAt') body from subscription_admin_events e join auth.users u on u.id=e.actor_id where e.business_id=bid order by e.created_at desc limit 30)x),'[]'::jsonb),
 'orders',coalesce((select jsonb_agg(x.body order by x.created_at desc) from (select o.created_at,jsonb_build_object('id',o.id,'offerCode',o.offer_code,'amount',o.amount,'currency',o.currency,'status',o.status,'createdAt',o.created_at,'paidAt',o.paid_at) body from billing_orders o where o.business_id=bid order by o.created_at desc limit 30)x),'[]'::jsonb));
end;$$;
revoke all on function public.platform_manage_subscription(uuid,text,jsonb),public.platform_subscriptions(text,text,integer,integer),public.platform_subscription_history(uuid) from public,anon,authenticated;
grant execute on function public.platform_manage_subscription(uuid,text,jsonb),public.platform_subscriptions(text,text,integer,integer),public.platform_subscription_history(uuid) to authenticated;

create or replace function public.accept_staff_invitation(invitation_id uuid) returns uuid language plpgsql security definer set search_path=public as $$
declare business uuid;entitlement jsonb;
begin
 select business_id into business from staff_invitations where id=invitation_id;
 if business is null then raise exception 'This invitation is unavailable';end if;
 perform 1 from businesses where id=business for update;
 entitlement:=business_subscription_state(business);
 if not (entitlement->>'hasAccess')::boolean then raise exception 'This business needs an active, unpaused subscription';end if;
 if not exists(select 1 from memberships where business_id=business and user_id=auth.uid()) and (select count(*) from memberships where business_id=business)>=(entitlement->>'maxMembers')::integer then raise exception 'This business has reached its plan team limit';end if;
 return accept_staff_invitation_v1(invitation_id);
end;$$;
-- Pauses also block edits to existing products, while reads and exports remain available.
alter function public.sync_workspace(uuid,jsonb) rename to sync_workspace_v2;
revoke all on function public.sync_workspace_v2(uuid,jsonb) from public,anon,authenticated;
create function public.sync_workspace(bid uuid,payload jsonb) returns jsonb language plpgsql security definer set search_path=public as $$
declare entitlement jsonb;p jsonb;
begin
 if not is_member(bid) then raise exception 'Workspace access denied';end if;
 perform 1 from businesses where id=bid for update;
 entitlement:=business_subscription_state(bid);
 if not (entitlement->>'hasAccess')::boolean then
  for p in select value from jsonb_array_elements(coalesce(payload->'products','[]'::jsonb)) loop
   if exists(select 1 from products x where x.business_id=bid and x.id=(p->>'id')::uuid and (x.name is distinct from p->>'name' or x.unit is distinct from p->>'unit' or x.category is distinct from p->>'category' or x.cost is distinct from (p->>'cost')::bigint or x.price is distinct from (p->>'price')::bigint or x.threshold is distinct from (p->>'threshold')::integer)) then raise exception 'An active, unpaused subscription is required to update products';end if;
  end loop;
 end if;
 return sync_workspace_v2(bid,payload);
end;$$;
revoke all on function public.sync_workspace(uuid,jsonb) from public,anon;
grant execute on function public.sync_workspace(uuid,jsonb) to authenticated;
alter function public.create_billing_order(uuid,text) rename to create_billing_order_v2;
revoke all on function public.create_billing_order_v2(uuid,text) from public,anon,authenticated;
create function public.create_billing_order(bid uuid,product_code text) returns jsonb language plpgsql security definer set search_path=public as $$
begin
 if business_role(bid) is distinct from 'owner' then raise exception 'Only the business owner can purchase a plan or report';end if;
 perform 1 from businesses where id=bid for update;
 if exists(select 1 from business_subscription_controls where business_id=bid and paused_at is not null) then raise exception 'This subscription is paused. Contact Countiva support before purchasing another plan';end if;
 return create_billing_order_v2(bid,product_code);
end;$$;
revoke all on function public.create_billing_order(uuid,text) from public,anon;
grant execute on function public.create_billing_order(uuid,text) to authenticated;
alter function public.platform_dashboard() rename to platform_dashboard_v1;
revoke all on function public.platform_dashboard_v1() from public,anon,authenticated;
create function public.platform_dashboard() returns jsonb language plpgsql stable security definer set search_path=public as $$
begin
 if platform_access() is null then raise exception 'Platform administrator access required';end if;
 return platform_dashboard_v1()||jsonb_build_object('scansToday',(select count(*) from stock_scan_requests where (created_at at time zone 'Africa/Lagos')::date=(now() at time zone 'Africa/Lagos')::date and status<>'failed'));
end;$$;
revoke all on function public.platform_dashboard() from public,anon;
grant execute on function public.platform_dashboard() to authenticated;

-- Buying during a trial/admin grant must not consume the paid period early.
alter function public.apply_verified_billing_payment(uuid,text,text,bigint,text,text,text) rename to apply_verified_billing_payment_v2;
revoke all on function public.apply_verified_billing_payment_v2(uuid,text,text,bigint,text,text,text) from public,anon,authenticated,service_role;
create function public.apply_verified_billing_payment(order_ref uuid,provider_checkout text,provider_payment text,paid_amount bigint,paid_currency text,event_ref text,event_kind text) returns boolean language plpgsql security definer set search_path=public as $$
declare business uuid;applied boolean;grant_end timestamptz;term subscription_terms;months_paid integer;
begin
 select business_id,months into business,months_paid from billing_orders where id=order_ref;
 if business is null then raise exception 'Unknown order';end if;
 perform 1 from businesses where id=business for update;
 applied:=apply_verified_billing_payment_v2(order_ref,provider_checkout,provider_payment,paid_amount,paid_currency,event_ref,event_kind);
 if applied and months_paid>0 then
  select max(ends_at) into grant_end from subscription_access_grants where business_id=business and revoked_at is null and ends_at>now();
  select * into term from subscription_terms where order_id=order_ref;
  if grant_end>term.starts_at then update subscription_terms set starts_at=grant_end,ends_at=grant_end+make_interval(months=>months_paid) where order_id=order_ref;end if;
 end if;
 return applied;
end;$$;
revoke all on function public.apply_verified_billing_payment(uuid,text,text,bigint,text,text,text) from public,anon,authenticated;
grant execute on function public.apply_verified_billing_payment(uuid,text,text,bigint,text,text,text) to service_role;

-- Include free trials and suppress paused businesses in the reminder queue.
create or replace function public.claim_due_reminders() returns jsonb language plpgsql security definer set search_path=public as $$
declare pref record;local_now timestamp:=now() at time zone 'Africa/Lagos';due_kind text;delivery_id uuid;result jsonb:='[]'::jsonb;
begin
 for pref in select p.*,b.name business_name,coalesce(nullif(split_part(u.raw_user_meta_data->>'owner_name',' ',1),''),'there') first_name,a.last_stock_at
 from notification_preferences p join memberships m on m.business_id=p.business_id and m.user_id=p.user_id join businesses b on b.id=p.business_id join auth.users u on u.id=p.user_id left join business_activity a on a.business_id=p.business_id
 where p.enabled and exists(select 1 from push_subscriptions s where s.business_id=p.business_id and s.user_id=p.user_id)
 and (business_subscription_state(p.business_id)->>'hasAccess')::boolean
 and ((p.morning and local_now>=local_now::date+p.morning_time and local_now<local_now::date+p.morning_time+interval '20 minutes') or (p.evening and local_now>=local_now::date+p.evening_time and local_now<local_now::date+p.evening_time+interval '20 minutes' and (a.last_stock_at is null or (a.last_stock_at at time zone 'Africa/Lagos')::date<local_now::date)))
 and not exists(select 1 from notification_deliveries d where d.business_id=p.business_id and d.user_id=p.user_id and d.reminder_date=local_now::date and d.kind=case when p.morning and local_now>=local_now::date+p.morning_time and local_now<local_now::date+p.morning_time+interval '20 minutes' then 'morning' else 'evening' end and (d.status='sent' or (d.status='pending' and d.claimed_at>now()-interval '5 minutes')))
 order by p.business_id,p.user_id limit 100 loop
  due_kind:=null;delivery_id:=null;
  if pref.morning and local_now>=local_now::date+pref.morning_time and local_now<local_now::date+pref.morning_time+interval '20 minutes' then due_kind:='morning';
  elsif pref.evening and local_now>=local_now::date+pref.evening_time and local_now<local_now::date+pref.evening_time+interval '20 minutes' and (pref.last_stock_at is null or (pref.last_stock_at at time zone 'Africa/Lagos')::date<local_now::date) then due_kind:='evening';end if;
  if due_kind is null then continue;end if;
  insert into notification_deliveries(business_id,user_id,reminder_date,kind) values(pref.business_id,pref.user_id,local_now::date,due_kind)
  on conflict(business_id,user_id,reminder_date,kind) do update set claimed_at=now(),status='pending' where notification_deliveries.status='failed' or (notification_deliveries.status='pending' and notification_deliveries.claimed_at<now()-interval '5 minutes') returning id into delivery_id;
  if delivery_id is not null then result:=result||jsonb_build_array(jsonb_build_object('id',delivery_id,'businessId',pref.business_id,'userId',pref.user_id,'name',pref.first_name,'businessName',pref.business_name,'kind',due_kind));end if;
 end loop;
 return result;
end;$$;
revoke all on function public.claim_due_reminders() from public,anon,authenticated;
grant execute on function public.claim_due_reminders() to service_role;
commit;
