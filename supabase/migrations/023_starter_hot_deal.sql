begin;
-- Apply once after 022. The real catalogue price is retained; the seven-day window starts here.
create table public.billing_promotions (
 code text primary key references billing_catalog(code),amount bigint not null check(amount>0),
 starts_at timestamptz not null default now(),ends_at timestamptz not null default now()+interval '7 days',
 enabled boolean not null default true,check(ends_at>starts_at)
);
insert into billing_promotions(code,amount) values('starter-monthly',200000);
alter table billing_promotions enable row level security;
revoke all on billing_promotions from public,anon,authenticated;
grant all on billing_promotions to service_role;
alter table manual_payment_requests add column promotion_ends_at timestamptz;

create or replace function public.effective_plan_amount(product_code text) returns bigint language sql stable security definer set search_path=public as $$
 select least(c.amount,coalesce((select p.amount from billing_promotions p where p.code=c.code and p.enabled and p.starts_at<=now() and p.ends_at>now()),c.amount))
 from billing_catalog c where c.code=product_code and c.enabled and c.category in ('monthly','annual')
$$;
create or replace function public.public_plan_catalog() returns jsonb language sql stable security definer set search_path=public as $$
 select coalesce(jsonb_agg(jsonb_build_object('code',c.code,'name',c.name,'tier',c.tier,'category',c.category,'months',c.months,
 'amount',coalesce(effective_plan_amount(c.code),c.amount),'baseAmount',c.amount,'promotionEndsAt',p.ends_at,'promotionLabel',case when p.code is not null then 'Hot Deal' else null end,
 'enabled',c.enabled,'revision',c.revision) order by c.months,c.amount),'[]'::jsonb)
 from billing_catalog c left join billing_promotions p on p.code=c.code and p.enabled and p.starts_at<=now() and p.ends_at>now() and p.amount<c.amount
 where c.category in ('monthly','annual')
$$;
-- Admin price editors must continue to edit the normal price, not the temporary deal.
alter function public.platform_plan_settings() rename to platform_plan_settings_before_promotion;
revoke all on function public.platform_plan_settings_before_promotion() from public,anon,authenticated;
create function public.platform_plan_settings() returns jsonb language plpgsql stable security definer set search_path=public as $$
declare result jsonb;
begin
 result:=platform_plan_settings_before_promotion();
 result:=jsonb_set(result,'{plans}',coalesce((select jsonb_agg(value||jsonb_build_object('amount',coalesce(value->'baseAmount',value->'amount'))) from jsonb_array_elements(result->'plans')),'[]'::jsonb));
 return result||jsonb_build_object('promotion',(select to_jsonb(p) from billing_promotions p where code='starter-monthly'));
end;$$;
revoke all on function public.platform_plan_settings() from public,anon;
grant execute on function public.platform_plan_settings() to authenticated;

create function public.snapshot_manual_promotion() returns trigger language plpgsql security definer set search_path=public as $$
declare deadline timestamptz;
begin
 select p.ends_at into deadline from billing_promotions p join billing_catalog c on c.code=p.code where p.code=new.offer_code and p.enabled and p.starts_at<=now() and p.ends_at>now() and p.amount<c.amount and new.amount=p.amount;
 if deadline is not null then new.promotion_ends_at:=deadline;new.quote_expires_at:=least(new.quote_expires_at,deadline);end if;
 return new;
end;$$;
create trigger manual_payment_promotion before insert on manual_payment_requests for each row execute function snapshot_manual_promotion();
revoke all on function public.snapshot_manual_promotion() from public,anon,authenticated;

-- Every online entry point checks the effective price server-side, including direct RPC calls.
create or replace function public.create_plan_order(bid uuid,product_code text,quoted_amount bigint) returns jsonb
language plpgsql security definer set search_path=public as $$
declare product billing_catalog; existing billing_orders; placed billing_orders; current_amount bigint; seats integer;
begin
 if business_role(bid) is distinct from 'owner' then raise exception 'Only the business owner can purchase a plan';end if;
 perform 1 from businesses where id=bid for update;
 if exists(select 1 from business_subscription_controls where business_id=bid and paused_at is not null) then raise exception 'Subscription paused. Contact Countiva before purchasing';end if;
 select * into product from billing_catalog where code=product_code and enabled and category in ('monthly','annual') and months in (1,12) for share;
 current_amount:=effective_plan_amount(product_code);
 if product.code is null or current_amount is distinct from quoted_amount then raise exception 'The plan price has changed. Refresh and review the latest price before checkout';end if;
 select count(*) into seats from memberships where business_id=bid;
 seats:=seats+(select count(*) from staff_invitations where business_id=bid and accepted_at is null and revoked_at is null and expires_at>now());
 if seats>(package_limits(product.tier)->>'members')::integer then raise exception 'This package cannot fit your team and pending invitations';end if;
 if exists(select 1 from manual_payment_requests where business_id=bid and status='submitted') then raise exception 'A bank transfer is awaiting review. Check its status before paying again';end if;
 update billing_orders set status='expired' where business_id=bid and status='pending' and created_at<=now()-interval '30 minutes';
 select * into existing from billing_orders where business_id=bid and status='pending' order by created_at desc limit 1;
 if existing.id is not null then
  if existing.offer_code=product_code and existing.amount=quoted_amount then return to_jsonb(existing);end if;
  raise exception 'An earlier checkout is still open. Wait for it to expire before starting another';
 end if;
 insert into billing_orders(business_id,user_id,offer_code,tier,months,amount,currency) values(bid,auth.uid(),product.code,product.tier,product.months,current_amount,'NGN') returning * into placed;
 return to_jsonb(placed);
end;$$;
create or replace function public.create_billing_order(bid uuid,product_code text) returns jsonb language plpgsql security definer set search_path=public as $$
begin return create_plan_order(bid,product_code,effective_plan_amount(product_code));end;$$;

-- Promo bank credits must actually have arrived during the offer, even when reviewed later.
alter function public.review_manual_payment(uuid,text,bigint,text,text,boolean) rename to review_manual_payment_before_promotion;
revoke all on function public.review_manual_payment_before_promotion(uuid,text,bigint,text,text,boolean) from public,anon,authenticated,service_role;
create function public.review_manual_payment(request_ref uuid,decision text,received_amount bigint,bank_ref text,review_reason text,credit_confirmed boolean,bank_credited_at timestamptz default null) returns jsonb
language plpgsql security definer set search_path=public as $$
declare request manual_payment_requests;bid uuid;
begin
 if coalesce(platform_access(),'') not in ('owner','admin') then raise exception 'Platform payment administrator access required';end if;
 select business_id into bid from manual_payment_requests where id=request_ref;
 perform 1 from businesses where id=bid for update;
 select * into request from manual_payment_requests where id=request_ref for update;
 if decision='approve' and request.status<>'approved' and request.promotion_ends_at is not null and
  (bank_credited_at is null or bank_credited_at>=request.promotion_ends_at or bank_credited_at<date_trunc('minute',request.created_at) or bank_credited_at>now()) then
  raise exception 'For a Hot Deal, enter the actual bank credit date and time. It must be within the quoted offer window. Resolve later payments with the customer before approval';
 end if;
 return review_manual_payment_before_promotion(request_ref,decision,received_amount,bank_ref,review_reason,credit_confirmed);
end;$$;
revoke all on function public.review_manual_payment(uuid,text,bigint,text,text,boolean,timestamptz) from public,anon,authenticated;
grant execute on function public.review_manual_payment(uuid,text,bigint,text,text,boolean,timestamptz) to authenticated;
notify pgrst,'reload schema';
commit;
