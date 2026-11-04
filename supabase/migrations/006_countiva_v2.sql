begin;
-- Countiva V2. Apply after migrations 001-005. No browser write access to billing state.
create table public.billing_catalog (
 code text primary key, name text not null, tier text check(tier in ('starter','growth')),
 category text not null check(category in ('monthly','annual','analytics')), months integer not null check(months between 0 and 12),
 amount bigint not null check(amount>0), currency text not null default 'NGN' check(currency='NGN'), provider_product_id text, enabled boolean not null default true
);
insert into billing_catalog(code,name,tier,category,months,amount) values
 ('starter-monthly','Countiva Starter · 1 month','starter','monthly',1,2500000),
 ('growth-monthly','Countiva Growth · 1 month','growth','monthly',1,4500000),
 ('growth-quarter','Countiva Growth Hot Plan · 3 months','growth','monthly',3,6000000),
 ('growth-halfyear','Countiva Growth · 6 months','growth','annual',6,15000000),
 ('growth-year','Countiva Growth · 12 months','growth','annual',12,35000000),
 ('analytics-report','Countiva detailed analytics report',null,'analytics',0,500000);
create table public.billing_orders (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references businesses(id), user_id uuid not null references auth.users(id),
 offer_code text not null references billing_catalog(code), tier text check(tier in ('starter','growth')), months integer not null, amount bigint not null check(amount>0), currency text not null default 'NGN',
 status text not null default 'pending' check(status in ('pending','paid','expired','failed','reversed')),
 checkout_id text unique, checkout_url text, payment_id text unique, created_at timestamptz not null default now(), paid_at timestamptz
);
create index billing_orders_business on billing_orders(business_id,created_at desc);
create table public.subscription_terms (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references businesses(id), order_id uuid not null unique references billing_orders(id),
 offer_code text not null references billing_catalog(code), tier text not null check(tier in ('starter','growth')), starts_at timestamptz not null, ends_at timestamptz not null, revoked_at timestamptz,
 check(ends_at>starts_at)
);
create index subscription_terms_business on subscription_terms(business_id,starts_at,ends_at);
create table public.billing_events (event_id text primary key, event_type text not null, order_id uuid references billing_orders(id), processed_at timestamptz not null default now());
-- Existing workspaces keep access during migration. A verified payment retires this grant.
create table public.legacy_billing_access (business_id uuid primary key references businesses(id), granted_at timestamptz not null default now());
insert into legacy_billing_access(business_id) select id from businesses;
create table public.stock_scan_requests (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references businesses(id), user_id uuid not null references auth.users(id),
 usage_month date not null default date_trunc('month',now() at time zone 'Africa/Lagos')::date,
 item_limit integer not null, status text not null default 'reserved' check(status in ('reserved','ready','applied','failed')), created_at timestamptz not null default now()
);
create index scan_requests_usage on stock_scan_requests(business_id,usage_month,status);
create table public.analytics_reports (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references businesses(id), order_id uuid not null unique references billing_orders(id),
 status text not null default 'pending' check(status in ('pending','processing','ready')), report jsonb, generated_at timestamptz, processing_at timestamptz
);
create table public.notification_preferences (
 business_id uuid not null references businesses(id), user_id uuid not null references auth.users(id), enabled boolean not null default false,
 morning boolean not null default true, evening boolean not null default true, morning_time time not null default '08:00', evening_time time not null default '20:00',
 primary key(business_id,user_id)
);
create table public.push_subscriptions (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references businesses(id), user_id uuid not null references auth.users(id),
 endpoint text not null check(length(endpoint)<=4096), p256dh text not null, auth_secret text not null, created_at timestamptz not null default now(), unique(business_id,user_id,endpoint)
);
create table public.business_activity (
 business_id uuid primary key references businesses(id), last_stock_at timestamptz, last_visit_at timestamptz
);
create table public.notification_deliveries (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references businesses(id), user_id uuid not null references auth.users(id),
 reminder_date date not null, kind text not null check(kind in ('morning','evening')), status text not null default 'pending' check(status in ('pending','sent','failed')),
 claimed_at timestamptz not null default now(), unique(business_id,user_id,reminder_date,kind)
);
alter table businesses add column receipt_template text not null default 'classic' check(receipt_template in ('classic','minimal','ledger','bold'));

create function public.business_entitlements(bid uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare term record; upcoming record; tier_name text:='starter'; has_access boolean; legacy boolean; used integer; cap integer;
begin
 if not is_member(bid) then raise exception 'Workspace access denied'; end if;
 select t.* into term from subscription_terms t where t.business_id=bid and t.revoked_at is null and t.starts_at<=now() and t.ends_at>now() order by t.ends_at desc limit 1;
 legacy:=exists(select 1 from legacy_billing_access where business_id=bid);
 has_access:=term.id is not null or legacy;
 if term.id is not null then tier_name:=term.tier; end if;
 select t.* into upcoming from subscription_terms t where t.business_id=bid and t.revoked_at is null and t.starts_at>now() order by t.starts_at limit 1;
 select count(*) into used from stock_scan_requests where business_id=bid and usage_month=date_trunc('month',now() at time zone 'Africa/Lagos')::date and status<>'failed';
 cap:=case when tier_name='growth' then 6 else 3 end;
 -- A queued downgrade also caps invitations, so the next term can start safely.
 if upcoming.tier='starter' or exists(select 1 from billing_orders where business_id=bid and tier='starter' and status='pending' and created_at>now()-interval '30 minutes') then cap:=least(cap,3); end if;
 return jsonb_build_object('tier',tier_name,'status',case when term.id is not null then 'active' when legacy then 'legacy' else 'inactive' end,'hasAccess',has_access,'maxMembers',cap,
 'receiptTemplates',case when tier_name='growth' then '["classic","minimal","ledger","bold"]'::jsonb else '["classic","minimal"]'::jsonb end,
 'scanLimit',case when tier_name='growth' then 100 else 20 end,'scanItems',case when tier_name='growth' then 40 else 10 end,'scansUsed',used,
 'currentOffer',term.offer_code,'expiresAt',term.ends_at,'nextOffer',upcoming.offer_code,'nextStartsAt',upcoming.starts_at);
end;$$;
create function public.create_billing_order(bid uuid,product_code text) returns jsonb language plpgsql security definer set search_path=public as $$
declare product billing_catalog; existing billing_orders; result billing_orders; seats integer;
begin
 if business_role(bid) is distinct from 'owner' then raise exception 'Only the business owner can purchase a plan or report'; end if;
 perform 1 from businesses where id=bid for update;
 select * into product from billing_catalog where code=product_code and enabled;
 if not found then raise exception 'This product is unavailable'; end if;
 if product.category='analytics' and not (business_entitlements(bid)->>'hasAccess')::boolean then raise exception 'Activate your business subscription before purchasing a report'; end if;
 select count(*) into seats from memberships where business_id=bid;
 seats:=seats+(select count(*) from staff_invitations where business_id=bid and accepted_at is null and revoked_at is null and expires_at>now());
 if product.tier='starter' and seats>3 then raise exception 'Starter allows the owner and two other users. Remove extra members or pending invitations before changing plans'; end if;
 update billing_orders set status='expired' where business_id=bid and status='pending' and created_at<now()-interval '30 minutes';
 select * into existing from billing_orders where business_id=bid and status='pending' order by created_at desc limit 1;
 if existing.id is not null then
  if existing.offer_code=product_code then return to_jsonb(existing); else raise exception 'A different checkout is still pending. Complete it or wait for it to expire before starting another'; end if;
 end if;
 insert into billing_orders(business_id,user_id,offer_code,tier,months,amount,currency) values(bid,auth.uid(),product.code,product.tier,product.months,product.amount,product.currency) returning * into result;
 return to_jsonb(result);
end;$$;
create function public.business_billing_history(bid uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
begin
 if business_role(bid) is distinct from 'owner' then raise exception 'Only the owner can view billing history'; end if;
 return coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc) from (select id,offer_code,amount,currency,status,created_at,paid_at from billing_orders where business_id=bid order by created_at desc limit 30)x),'[]'::jsonb);
end;$$;
create function public.apply_verified_billing_payment(order_ref uuid,provider_checkout text,provider_payment text,paid_amount bigint,paid_currency text,event_ref text,event_kind text) returns boolean language plpgsql security definer set search_path=public as $$
declare purchase billing_orders; product billing_catalog; start_at timestamptz; end_at timestamptz; business uuid;
begin
 select business_id into business from billing_orders where id=order_ref;
 if business is null then raise exception 'Unknown order'; end if;
 perform 1 from businesses where id=business for update;
 select * into purchase from billing_orders where id=order_ref for update;
 if paid_amount is null or paid_currency is null or provider_checkout is null or provider_payment is null or purchase.amount<>paid_amount or purchase.currency<>paid_currency or purchase.checkout_id is distinct from provider_checkout then raise exception 'Payment does not match its checkout'; end if;
 if purchase.status='paid' then return false; end if;
 if purchase.status='reversed' then raise exception 'This payment was reversed'; end if;
 if exists(select 1 from billing_events where event_id=event_ref) then return false; end if;
 select * into product from billing_catalog where code=purchase.offer_code;
 update billing_orders set status='paid',paid_at=now(),payment_id=provider_payment where id=purchase.id;
 if purchase.months=0 then
  insert into analytics_reports(business_id,order_id) values(business,purchase.id) on conflict do nothing;
 else
  select greatest(now(),coalesce(max(ends_at),now())) into start_at from subscription_terms where business_id=business and revoked_at is null and ends_at>now();
  end_at:=start_at+make_interval(months=>purchase.months);
  insert into subscription_terms(business_id,order_id,offer_code,tier,starts_at,ends_at) values(business,purchase.id,purchase.offer_code,purchase.tier,start_at,end_at) on conflict do nothing;
  delete from legacy_billing_access where business_id=business;
 end if;
 insert into billing_events(event_id,event_type,order_id) values(event_ref,event_kind,purchase.id);
 insert into audit_logs(business_id,actor_id,action) values(business,purchase.user_id,'verified_subscription_payment');
 return true;
end;$$;
create function public.reverse_billing_payment(provider_payment text,event_ref text,event_kind text) returns void language plpgsql security definer set search_path=public as $$
declare purchase billing_orders;
begin
 select * into purchase from billing_orders where payment_id=provider_payment for update;
 if purchase.id is null or exists(select 1 from billing_events where event_id=event_ref) then return; end if;
 update billing_orders set status='reversed' where id=purchase.id;
 update subscription_terms set revoked_at=now() where order_id=purchase.id;
 update analytics_reports set status='pending',report=null where order_id=purchase.id;
 insert into billing_events values(event_ref,event_kind,purchase.id,now());
end;$$;

-- Team capacity is enforced for invitations and acceptance, under a business lock.
alter function public.invite_staff(uuid,text,text) rename to invite_staff_v1;
revoke all on function public.invite_staff_v1(uuid,text,text) from public,anon,authenticated;
create function public.invite_staff(bid uuid,staff_email text,staff_role text) returns uuid language plpgsql security definer set search_path=public as $$
declare entitlement jsonb; seats integer;
begin
 if business_role(bid) is distinct from 'owner' then raise exception 'Only the business owner can invite staff'; end if;
 perform 1 from businesses where id=bid for update;
 entitlement:=business_entitlements(bid);
 if not (entitlement->>'hasAccess')::boolean then raise exception 'An active business subscription is required'; end if;
 select count(*) into seats from memberships where business_id=bid;
 seats:=seats+(select count(*) from staff_invitations where business_id=bid and accepted_at is null and revoked_at is null and expires_at>now());
 if seats>=(entitlement->>'maxMembers')::integer then raise exception 'Your plan’s team limit is reached, including pending invitations'; end if;
 return invite_staff_v1(bid,staff_email,staff_role);
end;$$;
alter function public.accept_staff_invitation(uuid) rename to accept_staff_invitation_v1;
revoke all on function public.accept_staff_invitation_v1(uuid) from public,anon,authenticated;
create function public.accept_staff_invitation(invitation_id uuid) returns uuid language plpgsql security definer set search_path=public as $$
declare business uuid; owner_user uuid; entitlement jsonb; cap integer;
begin
 select business_id into business from staff_invitations where id=invitation_id;
 if business is null then raise exception 'This invitation is unavailable'; end if;
 perform 1 from businesses where id=business for update;
 -- Do not call membership-gated entitlement lookup for a user who has not joined yet.
 select case when t.tier='growth' then 6 else 3 end into cap from subscription_terms t where t.business_id=business and t.revoked_at is null and t.starts_at<=now() and t.ends_at>now() order by t.ends_at desc limit 1;
 if cap is null and not exists(select 1 from legacy_billing_access where business_id=business) then raise exception 'This business needs an active subscription'; end if;
 cap:=coalesce(cap,3);
 if exists(select 1 from subscription_terms t where t.business_id=business and t.revoked_at is null and t.starts_at>now() and t.tier='starter') then cap:=least(cap,3); end if;
 if (select count(*) from memberships where business_id=business)>=cap then raise exception 'This business has reached its plan’s team limit'; end if;
 return accept_staff_invitation_v1(invitation_id);
end;$$;

-- Receipt template selection is a server-checked business setting.
alter function public.update_business_settings(uuid,jsonb) rename to update_business_settings_v1;
revoke all on function public.update_business_settings_v1(uuid,jsonb) from public,anon,authenticated;
create function public.update_business_settings(bid uuid,details jsonb) returns jsonb language plpgsql security definer set search_path=public as $$
declare result jsonb; chosen text:=coalesce(details->>'receipt_template','classic');
begin
 if business_role(bid) is distinct from 'owner' then raise exception 'Only the business owner can edit business settings'; end if;
 if not (business_entitlements(bid)->'receiptTemplates') ? chosen then raise exception 'This receipt template is not included in your plan'; end if;
 result:=update_business_settings_v1(bid,details-'receipt_template');
 update businesses set receipt_template=chosen where id=bid;
 return result||jsonb_build_object('receipt_template',chosen);
end;$$;
alter function public.sync_workspace(uuid,jsonb) rename to sync_workspace_v1;
revoke all on function public.sync_workspace_v1(uuid,jsonb) from public,anon,authenticated;
create function public.sync_workspace(bid uuid,payload jsonb) returns jsonb language plpgsql security definer set search_path=public as $$
declare result jsonb; cleaned jsonb:=payload; s jsonb; fresh_ids uuid[]; changed boolean; entitlement jsonb; chosen text; default_template text;
begin
 if not is_member(bid) then raise exception 'Workspace access denied'; end if;
 perform 1 from businesses where id=bid for update;
 entitlement:=business_entitlements(bid);
 changed:=exists(select 1 from jsonb_array_elements(coalesce(payload->'products','[]')) x where not exists(select 1 from products where business_id=bid and id=(x->>'id')::uuid))
 or exists(select 1 from jsonb_array_elements(coalesce(payload->'movements','[]')) x where not exists(select 1 from stock_movements where business_id=bid and id=(x->>'id')::uuid))
 or exists(select 1 from jsonb_array_elements(coalesce(payload->'sales','[]')) x where not exists(select 1 from sales where business_id=bid and id=(x->>'id')::uuid))
 or exists(select 1 from jsonb_array_elements(coalesce(payload->'payments','[]')) x where not exists(select 1 from payments where business_id=bid and id=(x->>'id')::uuid));
 if changed and not (entitlement->>'hasAccess')::boolean then raise exception 'Activate or renew your Countiva subscription to save new records online'; end if;
 select array_agg((x->>'id')::uuid) into fresh_ids from jsonb_array_elements(coalesce(payload->'sales','[]')) x where not exists(select 1 from sales where business_id=bid and id=(x->>'id')::uuid);
 select receipt_template into default_template from businesses where id=bid;
 -- The V1 validator continues to validate every original branding field.
 cleaned:=jsonb_set(cleaned,'{sales}',coalesce((select jsonb_agg(case when x ? 'branding' then jsonb_set(x,'{branding}',(x->'branding')-'template') else x end) from jsonb_array_elements(coalesce(payload->'sales','[]')) x),'[]'::jsonb));
 result:=sync_workspace_v1(bid,cleaned);
 for s in select x from jsonb_array_elements(coalesce(payload->'sales','[]')) x where (x->>'id')::uuid=any(coalesce(fresh_ids,'{}'::uuid[])) loop
  chosen:=coalesce(s->'branding'->>'template',default_template,'classic');
  if not (entitlement->'receiptTemplates') ? chosen then
   if s->'branding' ? 'template' then raise exception 'This receipt template is not included in your plan'; else chosen:='classic'; end if;
  end if;
  update sales set receipt_branding=receipt_branding||jsonb_build_object('template',chosen) where business_id=bid and id=(s->>'id')::uuid;
 end loop;
 result:=jsonb_set(result,'{sales}',coalesce((select jsonb_agg(x||jsonb_build_object('branding',s.receipt_branding)) from jsonb_array_elements(result->'sales') x join sales s on s.business_id=bid and s.id=(x->>'id')::uuid),'[]'::jsonb));
 if changed then insert into business_activity(business_id,last_stock_at) values(bid,now()) on conflict(business_id) do update set last_stock_at=now(); end if;
 return result;
end;$$;
create function public.visit_workspace(bid uuid) returns void language plpgsql security definer set search_path=public as $$
begin
 if not is_member(bid) then raise exception 'Workspace access denied'; end if;
 insert into business_activity(business_id,last_visit_at) values(bid,now()) on conflict(business_id) do update set last_visit_at=now();
end;$$;
create function public.begin_stock_scan(bid uuid) returns jsonb language plpgsql security definer set search_path=public as $$
declare entitlement jsonb; ticket stock_scan_requests;
begin
 if business_role(bid) not in ('owner','manager') or business_role(bid) is null then raise exception 'Only an owner or manager can scan stock'; end if;
 perform 1 from businesses where id=bid for update;
 entitlement:=business_entitlements(bid);
 if not (entitlement->>'hasAccess')::boolean then raise exception 'Activate your subscription before scanning stock'; end if;
 if (entitlement->>'scansUsed')::integer>=(entitlement->>'scanLimit')::integer then raise exception 'Your plan’s monthly scan allowance is used up'; end if;
 insert into stock_scan_requests(business_id,user_id,item_limit) values(bid,auth.uid(),(entitlement->>'scanItems')::integer) returning * into ticket;
 return jsonb_build_object('id',ticket.id,'itemLimit',ticket.item_limit,'remaining',(entitlement->>'scanLimit')::integer-(entitlement->>'scansUsed')::integer-1);
end;$$;
create function public.finish_stock_scan(ticket_id uuid,succeeded boolean) returns void language plpgsql security definer set search_path=public as $$
begin
 update stock_scan_requests set status=case when succeeded then 'ready' else 'failed' end where id=ticket_id and status='reserved';
end;$$;
create function public.apply_stock_scan(bid uuid,ticket_id uuid,rows jsonb) returns boolean language plpgsql security definer set search_path=public as $$
declare ticket stock_scan_requests; r jsonb; pid uuid; quantity integer; entitlement jsonb;
begin
 if business_role(bid) not in ('owner','manager') or business_role(bid) is null then raise exception 'Only an owner or manager can receive stock'; end if;
 perform 1 from businesses where id=bid for update;
 select * into ticket from stock_scan_requests where id=ticket_id and business_id=bid and user_id=auth.uid() for update;
 if ticket.id is null then raise exception 'Stock scan not found'; end if;
 if ticket.status='applied' then return false; end if;
 if ticket.status<>'ready' or ticket.created_at<now()-interval '24 hours' then raise exception 'This scan is no longer ready for confirmation'; end if;
 entitlement:=business_entitlements(bid);
 if not (entitlement->>'hasAccess')::boolean then raise exception 'An active subscription is required'; end if;
 if jsonb_typeof(rows)<>'array' or jsonb_array_length(rows) not between 1 and least(ticket.item_limit,(entitlement->>'scanItems')::integer) then raise exception 'This scan has more products than your plan allows'; end if;
 for r in select value from jsonb_array_elements(rows) loop
  quantity:=(r->>'quantity')::integer;
  if quantity is null or quantity not between 1 and 100000 then raise exception 'Confirm a positive whole quantity for every product'; end if;
  if nullif(r->>'productId','') is not null then
   pid:=(r->>'productId')::uuid;
   if not exists(select 1 from products where business_id=bid and id=pid) then raise exception 'A selected product is not in this business'; end if;
  else
   pid:=gen_random_uuid();
   if r->>'name' is null or r->>'unit' is null or length(trim(r->>'name')) not between 1 and 120 or length(trim(r->>'unit')) not between 1 and 80 or r->>'cost' is null or r->>'price' is null then raise exception 'New products need a name, stock unit, cost and selling price'; end if;
   insert into products(business_id,id,name,category,unit,cost,price,threshold) values(bid,pid,trim(r->>'name'),coalesce(nullif(r->>'category',''),'General'),trim(r->>'unit'),(r->>'cost')::bigint,(r->>'price')::bigint,5);
  end if;
  insert into stock_movements(business_id,id,product_id,quantity,reason,created_at,recorded_by) values(bid,gen_random_uuid(),pid,quantity,'Reviewed photo receiving',now(),auth.uid());
 end loop;
 update stock_scan_requests set status='applied' where id=ticket_id;
 insert into business_activity(business_id,last_stock_at) values(bid,now()) on conflict(business_id) do update set last_stock_at=now();
 insert into audit_logs(business_id,actor_id,action) values(bid,auth.uid(),'photo_stock_received');
 return true;
end;$$;
-- Remove the old unscoped, per-user scanner entry point.
revoke all on function public.reserve_scan() from public,anon,authenticated;

-- Notification controls are private to each user and each workspace.
create function public.get_notification_preferences(bid uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare prefs notification_preferences;
begin
 if not is_member(bid) then raise exception 'Workspace access denied'; end if;
 select * into prefs from notification_preferences where business_id=bid and user_id=auth.uid();
 return coalesce(to_jsonb(prefs),jsonb_build_object('enabled',false,'morning',true,'evening',true,'morning_time','08:00','evening_time','20:00'));
end;$$;
create function public.save_notification_preferences(bid uuid,details jsonb) returns void language plpgsql security definer set search_path=public as $$
begin
 if not is_member(bid) then raise exception 'Workspace access denied'; end if;
 insert into notification_preferences(business_id,user_id,enabled,morning,evening,morning_time,evening_time) values(bid,auth.uid(),coalesce((details->>'enabled')::boolean,false),coalesce((details->>'morning')::boolean,true),coalesce((details->>'evening')::boolean,true),(details->>'morning_time')::time,(details->>'evening_time')::time)
 on conflict(business_id,user_id) do update set enabled=excluded.enabled,morning=excluded.morning,evening=excluded.evening,morning_time=excluded.morning_time,evening_time=excluded.evening_time;
 if not coalesce((details->>'enabled')::boolean,false) then delete from push_subscriptions where business_id=bid and user_id=auth.uid(); end if;
end;$$;
create function public.save_push_subscription(bid uuid,details jsonb) returns void language plpgsql security definer set search_path=public as $$
begin
 if not is_member(bid) then raise exception 'Workspace access denied'; end if;
 if not exists(select 1 from notification_preferences where business_id=bid and user_id=auth.uid() and enabled) then raise exception 'Enable reminders before registering this device'; end if;
 if details->>'endpoint' is null or details->>'endpoint' !~ '^https://([a-zA-Z0-9-]+\.)*(push\.services\.mozilla\.com|fcm\.googleapis\.com|web\.push\.apple\.com|notify\.windows\.com)/' then raise exception 'Unsupported browser push service'; end if;
 if details->>'p256dh' is null or details->>'auth' is null or length(details->>'p256dh') not between 80 and 120 or length(details->>'auth') not between 16 and 40 then raise exception 'Invalid push subscription'; end if;
 perform 1 from businesses where id=bid for update;
 if (select count(*) from push_subscriptions where business_id=bid and user_id=auth.uid())>=5 and not exists(select 1 from push_subscriptions where business_id=bid and user_id=auth.uid() and endpoint=details->>'endpoint') then raise exception 'You can enable reminders on up to five browsers per business'; end if;
 insert into push_subscriptions(business_id,user_id,endpoint,p256dh,auth_secret) values(bid,auth.uid(),details->>'endpoint',details->>'p256dh',details->>'auth') on conflict(business_id,user_id,endpoint) do update set business_id=excluded.business_id,user_id=excluded.user_id,p256dh=excluded.p256dh,auth_secret=excluded.auth_secret where push_subscriptions.user_id=auth.uid();
end;$$;
create function public.list_business_reports(bid uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
begin
 if not is_member(bid) then raise exception 'Workspace access denied'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'status',r.status,'generatedAt',r.generated_at,'metrics',case when r.status='ready' then r.report->'metrics' else null end) order by o.created_at desc) from analytics_reports r join billing_orders o on o.id=r.order_id where r.business_id=bid and o.status='paid'),'[]'::jsonb);
end;$$;
create function public.reserve_business_report(bid uuid,report_id uuid) returns jsonb language plpgsql security definer set search_path=public as $$
declare report analytics_reports; snapshot jsonb;
begin
 if business_role(bid) not in ('owner','manager') or business_role(bid) is null then raise exception 'Only an owner or manager can generate a detailed report'; end if;
 select r.* into report from analytics_reports r join billing_orders o on o.id=r.order_id where r.id=report_id and r.business_id=bid and o.status='paid' for update of r;
 if report.id is null then raise exception 'Purchase a detailed analytics report first'; end if;
 if report.status='ready' then return jsonb_build_object('ready',true,'report',report.report); end if;
 if report.status='processing' and report.processing_at>now()-interval '5 minutes' then raise exception 'This report is already being prepared'; end if;
 update analytics_reports set status='processing',processing_at=now() where id=report_id;
 snapshot:=sync_workspace_v1(bid,'{"products":[],"movements":[],"sales":[],"payments":[]}'::jsonb);
 return jsonb_build_object('ready',false,'snapshot',snapshot);
end;$$;
create function public.complete_business_report(bid uuid,report_id uuid,report_data jsonb) returns void language plpgsql security definer set search_path=public as $$
begin
 if not exists(select 1 from analytics_reports r join billing_orders o on o.id=r.order_id where r.id=report_id and r.business_id=bid and o.status='paid') then raise exception 'Paid report not found'; end if;
 update analytics_reports set status='ready',report=report_data,generated_at=now() where id=report_id and business_id=bid;
end;$$;

-- Enable RLS and deny direct browser mutation, including invoice/payment activation.
do $$declare tab text; begin
 foreach tab in array array['billing_catalog','billing_orders','subscription_terms','billing_events','legacy_billing_access','stock_scan_requests','analytics_reports','notification_preferences','push_subscriptions','business_activity','notification_deliveries'] loop
  execute format('alter table public.%I enable row level security',tab);
  execute format('revoke all on public.%I from anon,authenticated',tab);
 end loop;
end;$$;
revoke all on function public.business_entitlements(uuid),public.create_billing_order(uuid,text),public.business_billing_history(uuid),public.apply_verified_billing_payment(uuid,text,text,bigint,text,text,text),public.reverse_billing_payment(text,text,text),public.invite_staff(uuid,text,text),public.accept_staff_invitation(uuid),public.update_business_settings(uuid,jsonb),public.sync_workspace(uuid,jsonb),public.visit_workspace(uuid),public.begin_stock_scan(uuid),public.finish_stock_scan(uuid,boolean),public.apply_stock_scan(uuid,uuid,jsonb),public.get_notification_preferences(uuid),public.save_notification_preferences(uuid,jsonb),public.save_push_subscription(uuid,jsonb),public.list_business_reports(uuid),public.reserve_business_report(uuid,uuid),public.complete_business_report(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.business_entitlements(uuid),public.create_billing_order(uuid,text),public.business_billing_history(uuid),public.invite_staff(uuid,text,text),public.accept_staff_invitation(uuid),public.update_business_settings(uuid,jsonb),public.sync_workspace(uuid,jsonb),public.visit_workspace(uuid),public.begin_stock_scan(uuid),public.apply_stock_scan(uuid,uuid,jsonb),public.get_notification_preferences(uuid),public.save_notification_preferences(uuid,jsonb),public.save_push_subscription(uuid,jsonb),public.list_business_reports(uuid),public.reserve_business_report(uuid,uuid) to authenticated;
grant execute on function public.apply_verified_billing_payment(uuid,text,text,bigint,text,text,text),public.reverse_billing_payment(text,text,text),public.complete_business_report(uuid,uuid,jsonb) to service_role;
grant execute on function public.finish_stock_scan(uuid,boolean) to service_role;
grant all on public.billing_catalog,public.billing_orders,public.subscription_terms,public.billing_events,public.stock_scan_requests,public.analytics_reports,public.notification_preferences,public.push_subscriptions,public.business_activity,public.notification_deliveries to service_role;

create function public.get_business_report(bid uuid,report_id uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare body jsonb;
begin
 if not is_member(bid) then raise exception 'Workspace access denied'; end if;
 select r.report into body from analytics_reports r join billing_orders o on o.id=r.order_id where r.id=report_id and r.business_id=bid and r.status='ready' and o.status='paid';
 if body is null then raise exception 'The report is not ready or is unavailable'; end if;
 return body;
end;$$;
create table public.daily_business_insights (business_id uuid not null references businesses(id),insight_date date not null,status text not null default 'processing',body jsonb,claimed_at timestamptz not null default now(),primary key(business_id,insight_date));
alter table public.daily_business_insights enable row level security;
revoke all on public.daily_business_insights from public,anon,authenticated;
grant all on public.daily_business_insights to service_role;
create function public.reserve_daily_insight(bid uuid) returns jsonb language plpgsql security definer set search_path=public as $$
declare existing daily_business_insights; stamp date:=(now() at time zone 'Africa/Lagos')::date;
begin
 if business_role(bid) not in ('owner','manager') or business_role(bid) is null then raise exception 'Only an owner or manager can create an AI brief'; end if;
 perform 1 from businesses where id=bid for update;
 if not (business_entitlements(bid)->>'hasAccess')::boolean then raise exception 'An active business subscription is required'; end if;
 select * into existing from daily_business_insights where business_id=bid and insight_date=stamp;
 if existing.status='ready' then return jsonb_build_object('cached',true,'body',existing.body); end if;
 if existing.business_id is not null and existing.claimed_at>now()-interval '15 minutes' then raise exception 'Your daily AI brief is being prepared. Try again shortly'; end if;
 insert into daily_business_insights(business_id,insight_date) values(bid,stamp) on conflict(business_id,insight_date) do update set claimed_at=now(),status='processing';
 return jsonb_build_object('cached',false,'snapshot',sync_workspace_v1(bid,'{"products":[],"movements":[],"sales":[],"payments":[]}'::jsonb));
end;$$;
create function public.complete_daily_insight(bid uuid,body_data jsonb) returns void language sql security definer set search_path=public as $$
 update daily_business_insights set body=body_data,status='ready' where business_id=bid and insight_date=(now() at time zone 'Africa/Lagos')::date
$$;
create function public.claim_due_reminders() returns jsonb language plpgsql security definer set search_path=public as $$
declare pref record; local_now timestamp:=now() at time zone 'Africa/Lagos'; due_kind text; delivery_id uuid; result jsonb:='[]'::jsonb;
begin
 for pref in select p.*,b.name business_name,coalesce(nullif(split_part(u.raw_user_meta_data->>'owner_name',' ',1),''),'there') first_name,a.last_stock_at from notification_preferences p join memberships m on m.business_id=p.business_id and m.user_id=p.user_id join businesses b on b.id=p.business_id join auth.users u on u.id=p.user_id left join business_activity a on a.business_id=p.business_id
 where p.enabled and exists(select 1 from push_subscriptions s where s.business_id=p.business_id and s.user_id=p.user_id)
 and (exists(select 1 from legacy_billing_access where business_id=p.business_id) or exists(select 1 from subscription_terms t where t.business_id=p.business_id and t.revoked_at is null and t.starts_at<=now() and t.ends_at>now()))
 and ((p.morning and local_now>=local_now::date+p.morning_time and local_now<local_now::date+p.morning_time+interval '20 minutes') or (p.evening and local_now>=local_now::date+p.evening_time and local_now<local_now::date+p.evening_time+interval '20 minutes' and (a.last_stock_at is null or (a.last_stock_at at time zone 'Africa/Lagos')::date<local_now::date)))
 and not exists(select 1 from notification_deliveries d where d.business_id=p.business_id and d.user_id=p.user_id and d.reminder_date=local_now::date and d.kind=case when p.morning and local_now>=local_now::date+p.morning_time and local_now<local_now::date+p.morning_time+interval '20 minutes' then 'morning' else 'evening' end and (d.status='sent' or (d.status='pending' and d.claimed_at>now()-interval '5 minutes')))
 order by p.business_id,p.user_id limit 100 loop
  due_kind:=null;delivery_id:=null;
  if pref.morning and local_now>=local_now::date+pref.morning_time and local_now<local_now::date+pref.morning_time+interval '20 minutes' then due_kind:='morning';
  elsif pref.evening and local_now>=local_now::date+pref.evening_time and local_now<local_now::date+pref.evening_time+interval '20 minutes' and (pref.last_stock_at is null or (pref.last_stock_at at time zone 'Africa/Lagos')::date<local_now::date) then due_kind:='evening';end if;
  if due_kind is null then continue; end if;
  insert into notification_deliveries(business_id,user_id,reminder_date,kind) values(pref.business_id,pref.user_id,local_now::date,due_kind)
  on conflict(business_id,user_id,reminder_date,kind) do update set claimed_at=now(),status='pending' where notification_deliveries.status='failed' or (notification_deliveries.status='pending' and notification_deliveries.claimed_at<now()-interval '5 minutes') returning id into delivery_id;
  if delivery_id is not null then result:=result||jsonb_build_array(jsonb_build_object('id',delivery_id,'businessId',pref.business_id,'userId',pref.user_id,'name',pref.first_name,'businessName',pref.business_name,'kind',due_kind));end if;
 end loop;
 return result;
end;$$;
revoke all on function public.get_business_report(uuid,uuid),public.reserve_daily_insight(uuid),public.complete_daily_insight(uuid,jsonb),public.claim_due_reminders() from public,anon,authenticated;
grant execute on function public.get_business_report(uuid,uuid),public.reserve_daily_insight(uuid) to authenticated;
grant execute on function public.complete_daily_insight(uuid,jsonb),public.claim_due_reminders() to service_role;
commit;
