begin;
-- Platform operations use the administrator's own identity; no customer sessions or memberships are minted.
create table public.platform_configuration_audit (
 id bigint generated always as identity primary key,actor_id uuid not null references auth.users(id),action text not null,
 target text not null,reason text not null,previous_value jsonb,next_value jsonb,created_at timestamptz not null default now()
);
create table public.platform_trial_settings (
 singleton boolean primary key default true check(singleton),enabled boolean not null default true,
 days integer not null default 45 check(days between 1 and 90),revision integer not null default 0,updated_at timestamptz not null default now()
);
insert into platform_trial_settings(singleton) values(true);
create table public.new_owner_trial_claims (
 owner_id uuid primary key references auth.users(id),business_id uuid not null references businesses(id),grant_id uuid references subscription_access_grants(id),claimed_at timestamptz not null default now()
);
-- Existing owners are not retroactively granted or restarted on a trial.
insert into new_owner_trial_claims(owner_id,business_id) select owner_id,id from businesses on conflict do nothing;
alter table public.billing_catalog add column revision integer not null default 0;
update billing_catalog set amount=case code when 'starter-monthly' then 3000000 when 'growth-monthly' then 5000000 when 'growth-quarter' then 13500000 when 'growth-halfyear' then 24000000 when 'growth-year' then 42000000 end,
 revision=revision+1 where code in ('starter-monthly','growth-monthly','growth-quarter','growth-halfyear','growth-year');

create function public.grant_new_owner_trial() returns trigger language plpgsql security definer set search_path=public as $$
declare settings platform_trial_settings; claimed uuid; grant_ref uuid;
begin
 if new.role<>'owner' then return new; end if;
 if not exists(select 1 from businesses where id=new.business_id and owner_id=new.user_id and created_at>now()-interval '5 minutes') then return new; end if;
 select * into settings from platform_trial_settings where singleton;
 insert into new_owner_trial_claims(owner_id,business_id) values(new.user_id,new.business_id) on conflict do nothing returning owner_id into claimed;
 if claimed is not null and settings.enabled then
  insert into subscription_access_grants(business_id,kind,tier,starts_at,ends_at,created_by,reason)
  values(new.business_id,'trial','growth',now(),now()+make_interval(days=>settings.days),new.user_id,'Automatic new-owner Growth trial') returning id into grant_ref;
  update new_owner_trial_claims set grant_id=grant_ref where owner_id=new.user_id;
 end if;
 return new;
end;$$;
create trigger new_owner_growth_trial after insert on memberships for each row execute function grant_new_owner_trial();

create function public.public_plan_catalog() returns jsonb language sql stable security definer set search_path=public as $$
 select coalesce(jsonb_agg(jsonb_build_object('code',code,'name',name,'tier',tier,'category',category,'months',months,'amount',amount,'enabled',enabled,'revision',revision) order by months,amount),'[]'::jsonb)
 from billing_catalog where category in ('monthly','annual')
$$;
create function public.public_trial_offer() returns jsonb language sql stable security definer set search_path=public as $$
 select jsonb_build_object('enabled',enabled,'days',days,'revision',revision) from platform_trial_settings where singleton
$$;
create function public.platform_plan_settings() returns jsonb language plpgsql stable security definer set search_path=public as $$
begin
 if platform_access() is null then raise exception 'Platform administrator access required'; end if;
 return jsonb_build_object('plans',public_plan_catalog(),'trial',public_trial_offer(),'audit',coalesce((select jsonb_agg(to_jsonb(x)) from (
 select a.id,a.action,a.target,a.reason,a.previous_value,a.next_value,a.created_at,u.email actor_email from platform_configuration_audit a
 join auth.users u on u.id=a.actor_id order by a.id desc limit 50)x),'[]'::jsonb));
end;$$;
create function public.platform_update_plan(plan_code text,amount_kobo bigint,available boolean,expected_revision integer,change_reason text) returns jsonb
language plpgsql security definer set search_path=public as $$
declare original billing_catalog; updated billing_catalog;
begin
 if coalesce(platform_access(),'') not in ('owner','admin') then raise exception 'Platform owner or administrator required'; end if;
 if length(trim(change_reason)) not between 5 and 500 or change_reason is null then raise exception 'Describe the pricing change'; end if;
 if amount_kobo is null or amount_kobo not between 100 and 100000000000 or available is null then raise exception 'Enter a valid plan price'; end if;
 lock table billing_catalog in share row exclusive mode;
 select * into original from billing_catalog where code=plan_code and category in ('monthly','annual') for update;
 if original.code is null then raise exception 'Plan not found'; end if;
 if expected_revision is distinct from original.revision then raise exception 'This price changed. Reload before saving'; end if;
 if not available and (select count(*) from billing_catalog where enabled and category in ('monthly','annual') and code<>plan_code)=0 then raise exception 'Keep at least one subscription offer enabled'; end if;
 update billing_catalog set amount=amount_kobo,enabled=available,revision=revision+1 where code=plan_code returning * into updated;
 insert into platform_configuration_audit(actor_id,action,target,reason,previous_value,next_value) values(auth.uid(),'plan_updated',plan_code,trim(change_reason),to_jsonb(original),to_jsonb(updated));
 return platform_plan_settings();
end;$$;
create function public.platform_update_trial(trial_days integer,available boolean,expected_revision integer,change_reason text) returns jsonb
language plpgsql security definer set search_path=public as $$
declare original platform_trial_settings; updated platform_trial_settings;
begin
 if coalesce(platform_access(),'') not in ('owner','admin') then raise exception 'Platform owner or administrator required'; end if;
 if change_reason is null or length(trim(change_reason)) not between 5 and 500 then raise exception 'Describe the trial change'; end if;
 if trial_days is null or trial_days not between 1 and 90 or available is null then raise exception 'Choose a trial duration between 1 and 90 days'; end if;
 select * into original from platform_trial_settings where singleton for update;
 if expected_revision is distinct from original.revision then raise exception 'Trial settings changed. Reload before saving'; end if;
 update platform_trial_settings set days=trial_days,enabled=available,revision=revision+1,updated_at=now() where singleton returning * into updated;
 insert into platform_configuration_audit(actor_id,action,target,reason,previous_value,next_value) values(auth.uid(),'trial_policy_updated','new-owner-trial',trim(change_reason),to_jsonb(original),to_jsonb(updated));
 return platform_plan_settings();
end;$$;
create function public.create_plan_order(bid uuid,product_code text,quoted_amount bigint) returns jsonb language plpgsql security definer set search_path=public as $$
declare current_amount bigint; placed jsonb;
begin
 if business_role(bid) is distinct from 'owner' then raise exception 'Only the business owner can purchase a plan'; end if;
 select amount into current_amount from billing_catalog where code=product_code and enabled and category in ('monthly','annual') for share;
 if current_amount is null then raise exception 'This plan is unavailable. Refresh the plan list'; end if;
 if quoted_amount is distinct from current_amount then raise exception 'The plan price has changed. Refresh and review the latest price before checkout'; end if;
 placed:=create_billing_order(bid,product_code);
 if (placed->>'amount')::bigint is distinct from quoted_amount then raise exception 'An earlier checkout is still open at a different price. Wait for it to expire before starting another'; end if;
 return placed;
end;$$;

create table public.platform_support_access (
 id uuid primary key default gen_random_uuid(),actor_id uuid not null references auth.users(id),business_id uuid not null references businesses(id),
 reason text not null check(length(reason) between 5 and 500),created_at timestamptz not null default now(),expires_at timestamptz not null default now()+interval '15 minutes'
);
create function public.platform_business_workspace(bid uuid,access_reason text) returns jsonb language plpgsql security definer set search_path=public as $$
declare access_id uuid; expiry timestamptz; workspace jsonb; snapshot jsonb;
begin
 if coalesce(platform_access(),'') not in ('owner','admin') then raise exception 'Platform owner or administrator required'; end if;
 if access_reason is null or length(trim(access_reason)) not between 5 and 500 then raise exception 'Enter a support or review reason'; end if;
 select to_jsonb(b) into workspace from businesses b where id=bid;
 if workspace is null then raise exception 'Business not found'; end if;
 insert into platform_support_access(actor_id,business_id,reason) values(auth.uid(),bid,trim(access_reason)) returning id,expires_at into access_id,expiry;
 select jsonb_build_object(
 'products',coalesce((select jsonb_agg(to_jsonb(p)||jsonb_build_object('archivedAt',p.archived_at,'stock',coalesce((select sum(quantity) from stock_movements where business_id=bid and product_id=p.id),0)-coalesce((select sum(quantity) from sale_items where business_id=bid and product_id=p.id),0))) from products p where business_id=bid),'[]'::jsonb),
 'sales',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'createdAt',s.created_at,'total',s.total,'paid',s.paid,'method',s.method,'customer',s.customer,'sync','synced','dueDate',s.due_date,'branding',s.receipt_branding,'receiptDetails',s.receipt_details,'recordedBy',s.recorded_by,
 'lines',(select jsonb_agg(jsonb_build_object('productId',i.product_id,'name',i.name,'unit',i.unit,'quantity',i.quantity,'price',i.price,'cost',i.cost,'originalPrice',i.original_price) order by i.position) from sale_items i where i.business_id=bid and i.sale_id=s.id)) order by s.created_at desc) from sales s where business_id=bid),'[]'::jsonb),
 'payments',coalesce((select jsonb_agg(jsonb_build_object('id',id,'saleId',sale_id,'amount',amount,'method',method,'createdAt',created_at)) from payments where business_id=bid),'[]'::jsonb),
 'movements',coalesce((select jsonb_agg(jsonb_build_object('id',id,'productId',product_id,'quantity',quantity,'reason',reason,'createdAt',created_at)) from stock_movements where business_id=bid),'[]'::jsonb)) into snapshot;
 return jsonb_build_object('sessionId',access_id,'expiresAt',expiry,'workspace',workspace,'snapshot',snapshot,
 'team',coalesce((select jsonb_agg(jsonb_build_object('email',u.email,'role',m.role)) from memberships m join auth.users u on u.id=m.user_id where m.business_id=bid),'[]'::jsonb),
 'subscription',business_subscription_state(bid));
end;$$;
create function public.platform_support_history() returns jsonb language plpgsql stable security definer set search_path=public as $$
begin
 if coalesce(platform_access(),'') not in ('owner','admin') then raise exception 'Platform owner or administrator required'; end if;
 return coalesce((select jsonb_agg(to_jsonb(x)) from (select a.id,a.business_id,b.name business_name,u.email actor_email,a.reason,a.created_at,a.expires_at from platform_support_access a join businesses b on b.id=a.business_id join auth.users u on u.id=a.actor_id order by a.created_at desc limit 100)x),'[]'::jsonb);
end;$$;
-- Daily briefs must include current transaction-price/discount fields, not an old sync version.
create table public.platform_ai_checks(actor_id uuid primary key references auth.users(id),checked_at timestamptz not null default now());
create function public.reserve_platform_ai_check() returns void language plpgsql security definer set search_path=public as $$
begin
 if coalesce(platform_access(),'') not in ('owner','admin') then raise exception 'Platform owner or administrator required'; end if;
 insert into platform_ai_checks(actor_id) values(auth.uid()) on conflict(actor_id) do update set checked_at=now() where platform_ai_checks.checked_at<now()-interval '30 seconds';
 if not found then raise exception 'Wait 30 seconds before testing the AI connection again'; end if;
end;$$;
create function public.release_daily_insight(bid uuid) returns void language sql security definer set search_path=public as $$
 update daily_business_insights set status='failed',claimed_at=now()-interval '14 minutes' where business_id=bid and insight_date=(now() at time zone 'Africa/Lagos')::date and status='processing'
$$;
create function public.platform_business_search(search_text text default '',offset_rows integer default 0) returns jsonb language plpgsql stable security definer set search_path=public as $$
begin
 if platform_access() is null then raise exception 'Platform administrator access required'; end if;
 if offset_rows<0 or offset_rows>100000 or length(search_text)>150 then raise exception 'Invalid search'; end if;
 return coalesce((select jsonb_agg(to_jsonb(x)) from (select b.id,b.name,u.email owner_email,b.created_at from businesses b join auth.users u on u.id=b.owner_id
 where b.name ilike '%'||search_text||'%' or u.email ilike '%'||search_text||'%' order by b.created_at desc,b.id offset offset_rows limit 50)x),'[]'::jsonb);
end;$$;
create function public.platform_server_health() returns jsonb language sql stable security definer set search_path=public as $$
 select jsonb_build_object('ready',true,'dailyInsights',to_regprocedure('public.complete_daily_insight(uuid,jsonb)') is not null,
 'stockScans',to_regprocedure('public.finish_stock_scan(uuid,boolean)') is not null)
$$;
do $migration$ declare definition text:=pg_get_functiondef('public.reserve_daily_insight(uuid)'::regprocedure);begin
 execute replace(definition,'sync_workspace_v1(bid,','sync_workspace(bid,');
end;$migration$;
do $$declare tab text;begin
 foreach tab in array array['platform_configuration_audit','platform_trial_settings','new_owner_trial_claims','platform_support_access','platform_ai_checks'] loop
  execute format('alter table public.%I enable row level security',tab);
  execute format('revoke all on public.%I from public,anon,authenticated',tab);
  execute format('grant all on public.%I to service_role',tab);
 end loop;
end;$$;
revoke all on function public.grant_new_owner_trial(),public.public_plan_catalog(),public.public_trial_offer(),public.platform_plan_settings(),public.platform_update_plan(text,bigint,boolean,integer,text),public.platform_update_trial(integer,boolean,integer,text),public.create_plan_order(uuid,text,bigint),public.platform_business_workspace(uuid,text),public.platform_support_history() from public,anon,authenticated;
grant execute on function public.public_plan_catalog(),public.public_trial_offer() to anon,authenticated;
grant execute on function public.platform_plan_settings(),public.platform_update_plan(text,bigint,boolean,integer,text),public.platform_update_trial(integer,boolean,integer,text),public.create_plan_order(uuid,text,bigint),public.platform_business_workspace(uuid,text),public.platform_support_history() to authenticated;
revoke all on function public.reserve_platform_ai_check(),public.release_daily_insight(uuid),public.platform_business_search(text,integer) from public,anon,authenticated;
grant execute on function public.reserve_platform_ai_check(),public.platform_business_search(text,integer) to authenticated;
grant execute on function public.release_daily_insight(uuid) to service_role;
revoke all on function public.platform_server_health() from public,anon,authenticated;
grant execute on function public.platform_server_health() to service_role;
notify pgrst,'reload schema';
commit;
