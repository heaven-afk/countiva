begin;
alter table public.website_visits drop constraint website_visits_path_check;
alter table public.website_visits add constraint website_visits_path_check check(path in ('/','/plans','/inventory-management','/sales-tracking','/receipts','/business-insights','/signup','/login'));
-- Requires 001-021. Manual payments never call the gateway payment-verification RPC.
create table public.manual_billing_settings (
 id boolean primary key default true check(id), enabled boolean not null default true,
 bank_name text not null, account_name text not null, account_number text not null check(account_number ~ '^[0-9]{10}$')
);
insert into manual_billing_settings values(true,true,'Alat by Wema','Zion Akachukwu Ogadi','0272178094');
create table public.manual_payment_requests (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references businesses(id) on delete cascade,
 user_id uuid not null references auth.users(id), offer_code text not null references billing_catalog(code),
 tier text not null check(tier in ('starter','growth','business')), months integer not null check(months in (1,12)),
 amount bigint not null check(amount>0), currency text not null default 'NGN' check(currency='NGN'),
 capacity_snapshot jsonb not null, bank_details jsonb not null,
 status text not null default 'quoted' check(status in ('quoted','submitted','approved','rejected','cancelled')),
 sender_name text, transfer_reference text, submitted_at timestamptz,
 created_at timestamptz not null default now(), quote_expires_at timestamptz not null default now()+interval '24 hours',
 reviewed_at timestamptz, reviewed_by uuid references auth.users(id), review_note text,
 bank_reference text unique, order_id uuid references billing_orders(id) on delete set null
);
create index manual_payment_queue on manual_payment_requests(status,submitted_at desc);
create index manual_payment_business on manual_payment_requests(business_id,created_at desc);
create table public.manual_payment_audit (
 id uuid primary key default gen_random_uuid(), request_id uuid references manual_payment_requests(id) on delete set null,
 actor_id uuid not null references auth.users(id), action text not null, amount bigint not null,
 bank_reference text, reason text not null, created_at timestamptz not null default now()
);
create table public.platform_alerts (
 id uuid primary key default gen_random_uuid(), event_key text not null unique,
 kind text not null check(kind in ('transfer','traffic_spike','business_spike','scan_spike')),
 title text not null, body text not null, created_at timestamptz not null default now()
);
create table public.platform_alert_reads (
 alert_id uuid not null references platform_alerts(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade, read_at timestamptz not null default now(),
 primary key(alert_id,user_id)
);
create table public.platform_notification_preferences (
 user_id uuid primary key references auth.users(id) on delete cascade,
 transfers boolean not null default true, spikes boolean not null default true, push_enabled boolean not null default false
);
create table public.platform_push_subscriptions (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 endpoint text not null check(length(endpoint)<=4096), p256dh text not null, auth_secret text not null,
 created_at timestamptz not null default now(), unique(user_id,endpoint)
);
create table public.platform_push_deliveries (
 alert_id uuid not null references platform_alerts(id) on delete cascade,
 subscription_id uuid not null references platform_push_subscriptions(id) on delete cascade,
 attempts integer not null default 0, claimed_at timestamptz, sent_at timestamptz,
 primary key(alert_id,subscription_id)
);
do $$declare tab text;begin
 foreach tab in array array['manual_billing_settings','manual_payment_requests','manual_payment_audit','platform_alerts','platform_alert_reads','platform_notification_preferences','platform_push_subscriptions','platform_push_deliveries'] loop
  execute format('alter table public.%I enable row level security',tab);
  execute format('revoke all on public.%I from public,anon,authenticated',tab);
  execute format('grant all on public.%I to service_role',tab);
 end loop;
end;$$;

create function public.effective_plan_amount(product_code text) returns bigint language sql stable security definer set search_path=public as $$
 select amount from billing_catalog where code=product_code and enabled and category in ('monthly','annual')
$$;
revoke all on function public.effective_plan_amount(text) from public,anon,authenticated;

create function public.create_manual_payment(bid uuid,product_code text,quoted_amount bigint) returns jsonb
language plpgsql security definer set search_path=public as $$
declare product billing_catalog; request manual_payment_requests; bank manual_billing_settings; seats integer;
begin
 if business_role(bid) is distinct from 'owner' then raise exception 'Only the business owner can purchase a plan';end if;
 perform 1 from businesses where id=bid for update;
 if coalesce((business_subscription_state(bid)->>'paused')::boolean,false) or exists(select 1 from business_subscription_controls where business_id=bid and paused_at is not null) then raise exception 'Contact Countiva to resume this paused subscription before purchasing';end if;
 select * into bank from manual_billing_settings where id and enabled;
 if bank.id is null then raise exception 'Manual bank transfer is currently unavailable';end if;
 select * into product from billing_catalog where code=product_code and enabled and months in (1,12) and category in ('monthly','annual') for share;
 product.amount:=effective_plan_amount(product_code);
 if product.code is null or product.amount is distinct from quoted_amount then raise exception 'The plan or price has changed. Refresh the plan list before paying';end if;
 select count(*) into seats from memberships where business_id=bid;
 seats:=seats+(select count(*) from staff_invitations where business_id=bid and accepted_at is null and revoked_at is null and expires_at>now());
 if seats>(package_limits(product.tier)->>'members')::integer then raise exception 'This plan cannot fit your staff and pending invitations';end if;
 select * into request from manual_payment_requests where business_id=bid and status='submitted' order by created_at desc limit 1;
 if request.id is not null then raise exception 'A transfer is already awaiting review. Check its status before making another payment';end if;
 select * into request from manual_payment_requests where business_id=bid and status='quoted' and quote_expires_at>now() order by created_at desc limit 1;
 if request.id is not null then
  if request.offer_code=product_code and request.amount=quoted_amount then return to_jsonb(request);end if;
  raise exception 'Cancel your existing payment instructions before choosing a different plan';
 end if;
 if (select count(*) from manual_payment_requests where business_id=bid and created_at>now()-interval '1 hour')>=5 then raise exception 'Too many payment requests. Please try again later';end if;
 insert into manual_payment_requests(business_id,user_id,offer_code,tier,months,amount,capacity_snapshot,bank_details)
 values(bid,auth.uid(),product.code,product.tier,product.months,product.amount,package_limits(product.tier),jsonb_build_object('bankName',bank.bank_name,'accountName',bank.account_name,'accountNumber',bank.account_number)) returning * into request;
 return to_jsonb(request);
end;$$;
create function public.submit_manual_payment(request_ref uuid,payer_name text,payer_reference text) returns jsonb
language plpgsql security definer set search_path=public as $$
declare request manual_payment_requests; bid uuid;
begin
 select business_id into bid from manual_payment_requests where id=request_ref;
 if business_role(bid) is distinct from 'owner' then raise exception 'Only the business owner can submit a transfer';end if;
 perform 1 from businesses where id=bid for update;
 select * into request from manual_payment_requests where id=request_ref for update;
 if request.status='submitted' then return to_jsonb(request);end if;
 if request.status<>'quoted' then raise exception 'This request is already closed';end if;
 if length(trim(coalesce(payer_name,''))) not between 2 and 120 or length(trim(coalesce(payer_reference,''))) not between 3 and 100 then raise exception 'Enter the sender name and bank transaction reference';end if;
 -- A late transfer is still reviewable; never discard a claim just because its quote expired.
 update manual_payment_requests set status='submitted',sender_name=trim(payer_name),transfer_reference=trim(payer_reference),submitted_at=now() where id=request_ref returning * into request;
 insert into platform_alerts(event_key,kind,title,body) values('transfer:'||request.id,'transfer','Transfer awaiting verification',
  (select left(name,100) from businesses where id=bid)||' submitted a '||request.tier||' bank transfer. Check the bank credit before approving.') on conflict do nothing;
 return to_jsonb(request);
end;$$;
create function public.cancel_manual_payment(request_ref uuid) returns void language plpgsql security definer set search_path=public as $$
declare bid uuid;
begin
 select business_id into bid from manual_payment_requests where id=request_ref;
 if business_role(bid) is distinct from 'owner' then raise exception 'Only the business owner can cancel payment instructions';end if;
 perform 1 from businesses where id=bid for update;
 update manual_payment_requests set status='cancelled' where id=request_ref and status='quoted';
 if not found then raise exception 'Only unsubmitted payment instructions can be cancelled. Contact support if you have already paid';end if;
end;$$;
create function public.business_manual_payments(bid uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
begin
 if business_role(bid) is distinct from 'owner' then raise exception 'Only the business owner can view transfer requests';end if;
 return coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc) from (select * from manual_payment_requests where business_id=bid order by created_at desc limit 30)x),'[]'::jsonb);
end;$$;
create function public.platform_manual_payments(status_filter text default 'submitted',offset_rows integer default 0) returns jsonb
language plpgsql stable security definer set search_path=public as $$
begin
 if coalesce(platform_access(),'') not in ('owner','admin') then raise exception 'Platform payment administrator access required';end if;
 if status_filter not in ('submitted','approved','rejected','all') or offset_rows<0 or offset_rows>100000 then raise exception 'Invalid payment filter';end if;
 return jsonb_build_object('total',(select count(*) from manual_payment_requests where (status_filter='all' or status=status_filter) and status<>'quoted' and status<>'cancelled'),
 'requests',coalesce((select jsonb_agg(to_jsonb(x) order by x.submitted_at desc) from (
 select p.*,b.name as business_name,u.email as owner_email from manual_payment_requests p join businesses b on b.id=p.business_id join auth.users u on u.id=b.owner_id
 where (status_filter='all' or p.status=status_filter) and p.status not in ('quoted','cancelled') order by p.submitted_at desc,p.id limit 25 offset offset_rows)x),'[]'::jsonb));
end;$$;
create function public.review_manual_payment(request_ref uuid,decision text,received_amount bigint,bank_ref text,review_reason text,credit_confirmed boolean) returns jsonb
language plpgsql security definer set search_path=public as $$
declare request manual_payment_requests; bid uuid; seats integer; start_at timestamptz; next_order uuid; canonical_ref text;
begin
 if coalesce(platform_access(),'') not in ('owner','admin') then raise exception 'Platform payment administrator access required';end if;
 if decision not in ('approve','reject') or decision is null or length(trim(coalesce(review_reason,''))) not between 5 and 500 then raise exception 'Choose a decision and enter a review note (5–500 characters)';end if;
 select business_id into bid from manual_payment_requests where id=request_ref;
 perform 1 from businesses where id=bid for update;
 select * into request from manual_payment_requests where id=request_ref for update;
 if request.id is null then raise exception 'Transfer request not found';end if;
 if request.status='approved' and decision='approve' then return to_jsonb(request);end if;
 if request.status<>'submitted' then raise exception 'Only submitted transfers can be reviewed';end if;
 if decision='approve' then
  if credit_confirmed is distinct from true or received_amount is distinct from request.amount then raise exception 'Confirm the actual bank credit matches the full quoted amount';end if;
  canonical_ref:=upper(regexp_replace(coalesce(bank_ref,''),'[^a-zA-Z0-9]','','g'));
  if length(canonical_ref) not between 6 and 100 then raise exception 'Enter the actual bank transaction reference (6–100 letters or digits)';end if;
  if exists(select 1 from manual_payment_audit where action='approve' and bank_reference=canonical_ref) then raise exception 'This bank transaction has already been used for a subscription';end if;
  select count(*) into seats from memberships where business_id=bid;
  seats:=seats+(select count(*) from staff_invitations where business_id=bid and accepted_at is null and revoked_at is null and expires_at>now());
  if seats>(request.capacity_snapshot->>'members')::integer then raise exception 'This business exceeds the selected plan capacity. Resolve its staff and pending invitations before approval';end if;
  select greatest(now(),coalesce((select max(ends_at) from subscription_terms where business_id=bid and revoked_at is null and ends_at>now()),now()),
   coalesce((select max(ends_at) from subscription_access_grants where business_id=bid and revoked_at is null and ends_at>now()),now())) into start_at;
  insert into billing_orders(business_id,user_id,offer_code,tier,months,amount,currency,status,payment_id,paid_at,capacity_snapshot)
  values(bid,request.user_id,request.offer_code,request.tier,request.months,request.amount,'NGN','paid','manual:'||canonical_ref,now(),request.capacity_snapshot) returning id into next_order;
  -- The existing insert trigger takes current package limits. Preserve the purchased quote instead.
  update billing_orders set capacity_snapshot=request.capacity_snapshot where id=next_order;
  insert into subscription_terms(business_id,order_id,offer_code,tier,starts_at,ends_at,capacity_snapshot)
  values(bid,next_order,request.offer_code,request.tier,start_at,start_at+make_interval(months=>request.months),request.capacity_snapshot);
  delete from legacy_billing_access where business_id=bid;
  update manual_payment_requests set status='approved',bank_reference=canonical_ref,order_id=next_order where id=request.id;
 else
  update manual_payment_requests set status='rejected' where id=request.id;
 end if;
 update manual_payment_requests set reviewed_at=now(),reviewed_by=auth.uid(),review_note=trim(review_reason) where id=request.id returning * into request;
 insert into manual_payment_audit(request_id,actor_id,action,amount,bank_reference,reason) values(request.id,auth.uid(),decision,request.amount,canonical_ref,trim(review_reason));
 insert into platform_audit(actor_id,action,target_user) values(auth.uid(),'manual_payment_'||decision,request.user_id);
 return to_jsonb(request);
end;$$;
-- The immutable unique reference survives business deletion and concurrent approvals.
create unique index manual_payment_used_bank_ref on manual_payment_audit(bank_reference) where action='approve';

alter function public.perform_business_deletion(uuid,text,boolean,text,text) rename to perform_business_deletion_before_manual;
revoke all on function public.perform_business_deletion_before_manual(uuid,text,boolean,text,text) from public,anon,authenticated,service_role;
create function public.perform_business_deletion(bid uuid,confirmation_name text,permanent boolean,actor_kind text,deletion_reason text) returns uuid
language plpgsql security definer set search_path=public as $$
begin
 perform 1 from businesses where id=bid for update;
 if exists(select 1 from manual_payment_requests where business_id=bid and status='submitted') then raise exception 'A bank transfer is awaiting review. Resolve it before deleting this business';end if;
 return perform_business_deletion_before_manual(bid,confirmation_name,permanent,actor_kind,deletion_reason);
end;$$;

create function public.evaluate_platform_spikes() returns void language plpgsql security definer set search_path=public as $$
declare item record; current_total numeric; previous_total numeric; floor_count integer; label text;
begin
 for item in select * from (values('traffic_spike','website_visits',20,'Website page views'),('business_spike','businesses',5,'New businesses'),('scan_spike','stock_scan_requests',50,'Stock scans')) as metrics(kind,tab,min_count,title) loop
  execute format('select count(*) filter(where created_at>=now()-interval ''24 hours''),count(*) filter(where created_at<now()-interval ''24 hours'') from %I where created_at>=now()-interval ''8 days''',item.tab) into current_total,previous_total;
  floor_count:=item.min_count; label:=item.title;
  if current_total>=floor_count and current_total>=greatest(1,previous_total/7)*3 then
   insert into platform_alerts(event_key,kind,title,body) values(item.kind||':'||(now() at time zone 'Africa/Lagos')::date,item.kind,label||' increased',
    current_total::integer||' in the last 24 hours; the prior 7-day daily average was '||round(previous_total/7,1)||'. This is an activity alert, not a diagnosis. Review the dashboard for context.') on conflict do nothing;
  end if;
 end loop;
end;$$;
create function public.platform_alert_inbox() returns jsonb language plpgsql security definer set search_path=public as $$
begin
 if coalesce(platform_access(),'') not in ('owner','admin') then raise exception 'Platform administrator access required';end if;
 perform evaluate_platform_spikes();
 return jsonb_build_object('unreadCount',(select count(*) from platform_alerts a left join platform_alert_reads r on r.alert_id=a.id and r.user_id=auth.uid() where r.alert_id is null and a.created_at>now()-interval '30 days'),
 'preferences',coalesce((select to_jsonb(p) from platform_notification_preferences p where p.user_id=auth.uid()),'{"transfers":true,"spikes":true,"push_enabled":false}'::jsonb),
 'alerts',coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc) from (select a.*,r.read_at from platform_alerts a left join platform_alert_reads r on r.alert_id=a.id and r.user_id=auth.uid() where a.created_at>now()-interval '30 days' order by a.created_at desc limit 100)x),'[]'::jsonb));
end;$$;
create function public.read_platform_alert(alert_ref uuid) returns void language plpgsql security definer set search_path=public as $$
begin
 if coalesce(platform_access(),'') not in ('owner','admin') then raise exception 'Platform administrator access required';end if;
 insert into platform_alert_reads(alert_id,user_id) select id,auth.uid() from platform_alerts where id=alert_ref on conflict do nothing;
end;$$;
create function public.save_platform_notification_preferences(transfer_alerts boolean,spike_alerts boolean,push_delivery boolean) returns void
language plpgsql security definer set search_path=public as $$
begin
 if coalesce(platform_access(),'') not in ('owner','admin') then raise exception 'Platform administrator access required';end if;
 insert into platform_notification_preferences(user_id,transfers,spikes,push_enabled) values(auth.uid(),transfer_alerts,spike_alerts,push_delivery)
 on conflict(user_id) do update set transfers=excluded.transfers,spikes=excluded.spikes,push_enabled=excluded.push_enabled;
 if not push_delivery then delete from platform_push_subscriptions where user_id=auth.uid();end if;
end;$$;
create function public.save_platform_push_subscription(details jsonb) returns void language plpgsql security definer set search_path=public as $$
begin
 if coalesce(platform_access(),'') not in ('owner','admin') then raise exception 'Platform administrator access required';end if;
 if not exists(select 1 from platform_notification_preferences where user_id=auth.uid() and push_enabled) then raise exception 'Enable admin push notifications first';end if;
 if details->>'endpoint' is null or details->>'endpoint' !~ '^https://([a-zA-Z0-9-]+\.)*(push\.services\.mozilla\.com|fcm\.googleapis\.com|web\.push\.apple\.com|notify\.windows\.com)/' or length(details->>'endpoint')>4096 then raise exception 'Unsupported browser push service';end if;
 if length(coalesce(details->>'p256dh','')) not between 40 and 200 or length(coalesce(details->>'auth','')) not between 16 and 100 then raise exception 'Invalid browser push keys';end if;
 if (select count(*) from platform_push_subscriptions where user_id=auth.uid() and endpoint<>details->>'endpoint')>=5 then raise exception 'Disconnect an existing admin device before adding another';end if;
 insert into platform_push_subscriptions(user_id,endpoint,p256dh,auth_secret) values(auth.uid(),details->>'endpoint',details->>'p256dh',details->>'auth')
 on conflict(user_id,endpoint) do update set p256dh=excluded.p256dh,auth_secret=excluded.auth_secret;
end;$$;
create function public.claim_platform_push_alerts() returns jsonb language plpgsql security definer set search_path=public as $$
declare job record; result jsonb:='[]'::jsonb;
begin
 perform evaluate_platform_spikes();
 insert into platform_push_deliveries(alert_id,subscription_id)
 select a.id,s.id from platform_alerts a cross join platform_push_subscriptions s
 join platform_notification_preferences p on p.user_id=s.user_id join platform_admins u on u.user_id=s.user_id join auth.users account on account.id=u.user_id
 where u.role in ('owner','admin') and account.email_confirmed_at is not null and p.push_enabled and a.created_at>greatest(s.created_at,now()-interval '24 hours')
 and case when a.kind='transfer' then p.transfers else p.spikes end on conflict do nothing;
 for job in select d.alert_id,d.subscription_id,a.title,a.body,a.kind,s.endpoint,s.p256dh,s.auth_secret
 from platform_push_deliveries d join platform_alerts a on a.id=d.alert_id join platform_push_subscriptions s on s.id=d.subscription_id
 join platform_notification_preferences p on p.user_id=s.user_id join platform_admins u on u.user_id=s.user_id join auth.users account on account.id=u.user_id
 where d.sent_at is null and d.attempts<5 and (d.claimed_at is null or d.claimed_at<now()-interval '5 minutes')
 and u.role in ('owner','admin') and account.email_confirmed_at is not null and p.push_enabled and case when a.kind='transfer' then p.transfers else p.spikes end
 and a.created_at>now()-interval '24 hours' order by a.created_at limit 20 for update of d skip locked loop
  update platform_push_deliveries set attempts=attempts+1,claimed_at=now() where alert_id=job.alert_id and subscription_id=job.subscription_id;
  result:=result||jsonb_build_array(to_jsonb(job));
 end loop;
 return result;
end;$$;

create function public.remove_platform_push_subscription(device_endpoint text) returns void language plpgsql security definer set search_path=public as $$
begin
 if auth.uid() is null then raise exception 'Please sign in again';end if;
 delete from platform_push_subscriptions where user_id=auth.uid() and endpoint=device_endpoint;
end;$$;
revoke all on function public.remove_platform_push_subscription(text) from public,anon,authenticated;
grant execute on function public.remove_platform_push_subscription(text) to authenticated;

create function public.platform_push_delivery_allowed(alert_ref uuid,subscription_ref uuid) returns boolean
language sql stable security definer set search_path=public as $$
 select exists(select 1 from platform_push_subscriptions s join platform_notification_preferences p on p.user_id=s.user_id
 join platform_admins a on a.user_id=s.user_id join auth.users u on u.id=a.user_id cross join platform_alerts e
 where s.id=subscription_ref and e.id=alert_ref and a.role in ('owner','admin') and u.email_confirmed_at is not null and p.push_enabled
 and case when e.kind='transfer' then p.transfers else p.spikes end)
$$;
revoke all on function public.platform_push_delivery_allowed(uuid,uuid) from public,anon,authenticated;
grant execute on function public.platform_push_delivery_allowed(uuid,uuid) to service_role;

revoke all on function public.create_manual_payment(uuid,text,bigint),public.submit_manual_payment(uuid,text,text),public.cancel_manual_payment(uuid),public.business_manual_payments(uuid),public.platform_manual_payments(text,integer),public.review_manual_payment(uuid,text,bigint,text,text,boolean),public.platform_alert_inbox(),public.read_platform_alert(uuid),public.save_platform_notification_preferences(boolean,boolean,boolean),public.save_platform_push_subscription(jsonb),public.claim_platform_push_alerts(),public.evaluate_platform_spikes(),public.perform_business_deletion(uuid,text,boolean,text,text) from public,anon,authenticated;
grant execute on function public.create_manual_payment(uuid,text,bigint),public.submit_manual_payment(uuid,text,text),public.cancel_manual_payment(uuid),public.business_manual_payments(uuid),public.platform_manual_payments(text,integer),public.review_manual_payment(uuid,text,bigint,text,text,boolean),public.platform_alert_inbox(),public.read_platform_alert(uuid),public.save_platform_notification_preferences(boolean,boolean,boolean),public.save_platform_push_subscription(jsonb) to authenticated;
grant execute on function public.claim_platform_push_alerts() to service_role;
notify pgrst,'reload schema';
commit;
