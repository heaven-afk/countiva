begin;
-- All event/endpoint mutations remain server-only. User preferences are workspace-scoped RPCs.
alter table public.notification_preferences
 add column low_stock boolean not null default false,
 add column overdue_debt boolean not null default false,
 add column daily_report boolean not null default false,
 add column weekly_report boolean not null default false,
 add column monthly_report boolean not null default false,
 add column report_time time not null default '20:00';

create or replace function public.get_notification_preferences(bid uuid) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare prefs notification_preferences;
begin
 if not is_member(bid) then raise exception 'Workspace access denied'; end if;
 select * into prefs from notification_preferences where business_id=bid and user_id=auth.uid();
 return coalesce(to_jsonb(prefs),jsonb_build_object('enabled',false,'morning',true,'evening',true,'morning_time','08:00','evening_time','20:00',
 'low_stock',false,'overdue_debt',false,'daily_report',false,'weekly_report',false,'monthly_report',false,'report_time','20:00'));
end;$$;
create or replace function public.save_notification_preferences(bid uuid,details jsonb) returns void
language plpgsql security definer set search_path=public as $$
begin
 if not is_member(bid) then raise exception 'Workspace access denied'; end if;
 if coalesce((details->>'enabled')::boolean,false) and not (
   coalesce((details->>'morning')::boolean,false) or coalesce((details->>'evening')::boolean,false) or
   coalesce((details->>'low_stock')::boolean,false) or coalesce((details->>'overdue_debt')::boolean,false) or
   coalesce((details->>'daily_report')::boolean,false) or coalesce((details->>'weekly_report')::boolean,false) or coalesce((details->>'monthly_report')::boolean,false))
 then raise exception 'Choose at least one notification category'; end if;
 insert into notification_preferences(business_id,user_id,enabled,morning,evening,morning_time,evening_time,low_stock,overdue_debt,daily_report,weekly_report,monthly_report,report_time)
 values(bid,auth.uid(),coalesce((details->>'enabled')::boolean,false),coalesce((details->>'morning')::boolean,true),coalesce((details->>'evening')::boolean,true),
 coalesce(nullif(details->>'morning_time',''),'08:00')::time,coalesce(nullif(details->>'evening_time',''),'20:00')::time,
 coalesce((details->>'low_stock')::boolean,false),coalesce((details->>'overdue_debt')::boolean,false),coalesce((details->>'daily_report')::boolean,false),
 coalesce((details->>'weekly_report')::boolean,false),coalesce((details->>'monthly_report')::boolean,false),coalesce(nullif(details->>'report_time',''),'20:00')::time)
 on conflict(business_id,user_id) do update set enabled=excluded.enabled,morning=excluded.morning,evening=excluded.evening,
 morning_time=excluded.morning_time,evening_time=excluded.evening_time,low_stock=excluded.low_stock,overdue_debt=excluded.overdue_debt,
 daily_report=excluded.daily_report,weekly_report=excluded.weekly_report,monthly_report=excluded.monthly_report,report_time=excluded.report_time;
 if not coalesce((details->>'enabled')::boolean,false) then delete from push_subscriptions where business_id=bid and user_id=auth.uid(); end if;
end;$$;

alter table analytics_reports drop constraint analytics_reports_period_days_check;
alter table analytics_reports add constraint analytics_reports_period_days_check check(period_days in (1,7,30,90));
do $migration$ declare definition text:=pg_get_functiondef('public.reserve_included_report(uuid,integer)'::regprocedure); begin
 execute replace(replace(definition,'days not in (7,30,90)','days not in (1,7,30,90)'),'Choose 7, 30 or 90 days','Choose 1, 7, 30 or 90 days');
end;$migration$;

create table public.business_push_events (
 id uuid primary key default gen_random_uuid(),business_id uuid not null references businesses(id),
 kind text not null check(kind in ('low_stock','overdue_debt','daily_report','weekly_report','monthly_report')),
 event_key text not null,subject_id uuid,episode bigint,title text not null,body text not null,url text not null,
 created_at timestamptz not null default now(),unique(business_id,kind,event_key)
);
create table public.business_push_deliveries (
 event_id uuid not null references business_push_events(id),user_id uuid not null references auth.users(id),
 status text not null default 'pending' check(status in ('pending','sent','failed','skipped')),
 attempts integer not null default 0,claimed_at timestamptz,next_attempt_at timestamptz not null default now(),
 primary key(event_id,user_id)
);
create table public.stock_alert_states (
 business_id uuid not null,product_id uuid not null,is_low boolean not null,episode bigint not null default 0,quantity bigint not null,
 primary key(business_id,product_id),foreign key(business_id,product_id) references products(business_id,id)
);
create table public.business_push_device_receipts (
 event_id uuid not null references business_push_events(id),user_id uuid not null references auth.users(id),subscription_id uuid not null,
 delivered_at timestamptz not null default now(),primary key(event_id,user_id,subscription_id)
);
create table public.scheduled_business_reports (
 id uuid primary key default gen_random_uuid(),business_id uuid not null references businesses(id),
 kind text not null check(kind in ('daily_report','weekly_report','monthly_report')),
 period_start date not null,period_end date not null,report jsonb,status text not null default 'pending' check(status in ('pending','processing','ready')),
 claimed_at timestamptz,generated_at timestamptz,unique(business_id,kind,period_end),check(period_end>=period_start)
);
create index business_push_recent on business_push_events(created_at,business_id);
create index sales_with_due_date on sales(business_id,due_date) where due_date is not null;
do $$declare tab text;begin
 foreach tab in array array['business_push_events','business_push_deliveries','business_push_device_receipts','stock_alert_states','scheduled_business_reports'] loop
  execute format('alter table public.%I enable row level security',tab);
  execute format('revoke all on public.%I from public,anon,authenticated',tab);
  execute format('grant all on public.%I to service_role',tab);
 end loop;
end;$$;

create function public.capture_stock_alert(bid uuid,pid uuid) returns void language plpgsql security definer set search_path=public as $$
declare product products; qty bigint; saved stock_alert_states;
begin
 select * into product from products where business_id=bid and id=pid;
 if product.id is null then return; end if;
 select coalesce((select sum(quantity) from stock_movements where business_id=bid and product_id=pid),0)-
 coalesce((select sum(quantity) from sale_items where business_id=bid and product_id=pid),0) into qty;
 insert into stock_alert_states values(bid,pid,product.archived_at is null and qty<=product.threshold,case when product.archived_at is null and qty<=product.threshold then 1 else 0 end,qty)
 on conflict(business_id,product_id) do update set quantity=excluded.quantity,is_low=excluded.is_low,
 episode=stock_alert_states.episode+case when excluded.is_low and not stock_alert_states.is_low then 1 else 0 end returning * into saved;
 if saved.is_low then
  insert into business_push_events(business_id,kind,event_key,subject_id,episode,title,body,url)
  values(bid,'low_stock',pid::text||':'||saved.episode,pid,saved.episode,'Countiva · Low stock',left(product.name,120)||' has '||qty||' '||left(product.unit,80)||' remaining.','/workspace?view=Inventory&business='||bid)
  on conflict do nothing;
 end if;
end;$$;
create function public.stock_alert_trigger() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if tg_table_name='products' then perform capture_stock_alert(new.business_id,new.id);
 else perform capture_stock_alert(new.business_id,new.product_id); end if;
 return new;
end;$$;
create trigger stock_push_product after insert or update of threshold,archived_at on products for each row execute function stock_alert_trigger();
create trigger stock_push_movement after insert on stock_movements for each row execute function stock_alert_trigger();
create trigger stock_push_sale after insert on sale_items for each row execute function stock_alert_trigger();

create function public.claim_scheduled_reports() returns jsonb language plpgsql security definer set search_path=public as $$
declare local_now timestamp:=now() at time zone 'Africa/Lagos'; saved scheduled_business_reports; result jsonb:='[]'::jsonb;
begin
 insert into scheduled_business_reports(business_id,kind,period_start,period_end)
 select distinct p.business_id,k.kind,
 case k.kind when 'daily_report' then local_now::date-1 when 'weekly_report' then date_trunc('week',local_now)::date-7 else (date_trunc('month',local_now)-interval '1 month')::date end,
 case k.kind when 'daily_report' then local_now::date-1 when 'weekly_report' then date_trunc('week',local_now)::date-1 else date_trunc('month',local_now)::date-1 end
 from notification_preferences p cross join (values('daily_report'),('weekly_report'),('monthly_report')) k(kind)
 join memberships m on m.business_id=p.business_id and m.user_id=p.user_id
 where p.enabled and local_now::time>=p.report_time and
  case k.kind when 'daily_report' then p.daily_report when 'weekly_report' then p.weekly_report else p.monthly_report end
  and coalesce((business_subscription_state(p.business_id)->>'hasAccess')::boolean,false)
 on conflict do nothing;
 for saved in select * from scheduled_business_reports r where (r.status='pending' or (r.status='processing' and r.claimed_at<now()-interval '5 minutes'))
 and r.period_end>local_now::date-40 and coalesce((business_subscription_state(r.business_id)->>'hasAccess')::boolean,false)
 order by r.period_end desc,r.id limit 2 for update skip locked loop
  update scheduled_business_reports set status='processing',claimed_at=now() where id=saved.id;
  result:=result||jsonb_build_array(jsonb_build_object('id',saved.id,'businessId',saved.business_id,'kind',saved.kind,'startDate',saved.period_start,'endDate',saved.period_end,'days',saved.period_end-saved.period_start+1));
 end loop;
 return result;
end;$$;

create function public.scheduled_report_snapshot(report_ref uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare bid uuid;
begin
 select business_id into bid from scheduled_business_reports where id=report_ref and status='processing';
 if bid is null or not coalesce((business_subscription_state(bid)->>'hasAccess')::boolean,false) then raise exception 'Report access unavailable'; end if;
 return jsonb_build_object(
 'products',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'unit',p.unit,'category',p.category,'price',p.price,'cost',p.cost,'threshold',p.threshold,'archivedAt',p.archived_at,
 'stock',coalesce((select sum(quantity) from stock_movements where business_id=bid and product_id=p.id),0)-coalesce((select sum(quantity) from sale_items where business_id=bid and product_id=p.id),0))) from products p where business_id=bid),'[]'::jsonb),
 'sales',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'createdAt',s.created_at,'total',s.total,'paid',s.paid,'method',s.method,'customer',s.customer,'sync','synced','dueDate',s.due_date,
 'lines',(select jsonb_agg(jsonb_build_object('productId',i.product_id,'name',i.name,'unit',i.unit,'quantity',i.quantity,'price',i.price,'cost',i.cost,'originalPrice',i.original_price) order by i.position) from sale_items i where i.business_id=bid and i.sale_id=s.id))) from sales s where s.business_id=bid),'[]'::jsonb),
 'payments',coalesce((select jsonb_agg(jsonb_build_object('id',id,'saleId',sale_id,'createdAt',created_at,'amount',amount,'method',method)) from payments where business_id=bid),'[]'::jsonb),
 'movements','[]'::jsonb);
end;$$;
create function public.complete_scheduled_report(report_ref uuid,body_data jsonb) returns void language plpgsql security definer set search_path=public as $$
declare saved scheduled_business_reports;
begin
 select * into saved from scheduled_business_reports where id=report_ref for update;
 if saved.id is null or saved.status<>'processing' then raise exception 'Report not reserved'; end if;
 if (body_data->>'days')::integer is distinct from saved.period_end-saved.period_start+1 or
 ((body_data->>'periodEnd')::timestamptz at time zone 'Africa/Lagos')::date is distinct from saved.period_end or
 ((body_data->>'periodStart')::timestamptz at time zone 'Africa/Lagos')::date is distinct from saved.period_start then raise exception 'Report period mismatch'; end if;
 update scheduled_business_reports set status='ready',report=body_data,generated_at=now() where id=report_ref;
 insert into business_push_events(business_id,kind,event_key,subject_id,title,body,url) values(saved.business_id,saved.kind,saved.id::text,saved.id,
 'Countiva · Your '||split_part(saved.kind,'_',1)||' report is ready','Review sales, gross profit, discounts and customer balances for '||saved.period_start||' to '||saved.period_end||'.',
 '/workspace?view=Business%20insights&business='||saved.business_id||'&report='||saved.id) on conflict do nothing;
end;$$;

create function public.claim_business_push_events() returns jsonb language plpgsql security definer set search_path=public as $$
declare job record; result jsonb:='[]'::jsonb; balance bigint; latest_body text; local_now timestamp:=now() at time zone 'Africa/Lagos';
begin
 insert into business_push_events(business_id,kind,event_key,subject_id,title,body,url)
 select s.business_id,'overdue_debt',s.id::text||':'||s.due_date,s.id,'Countiva · Customer payment overdue',
 left(s.customer,120)||' · payment due '||s.due_date||'.','/workspace?view=Customers%20%26%20credit&business='||s.business_id
 from sales s where s.due_date<local_now::date and s.total>s.paid+coalesce((select sum(amount) from payments p where p.business_id=s.business_id and p.sale_id=s.id),0)
 and coalesce((business_subscription_state(s.business_id)->>'hasAccess')::boolean,false)
 and exists(select 1 from notification_preferences n where n.business_id=s.business_id and n.enabled and n.overdue_debt)
 on conflict do nothing;
 insert into business_push_deliveries(event_id,user_id)
 select e.id,p.user_id from business_push_events e join notification_preferences p on p.business_id=e.business_id
 join memberships m on m.business_id=p.business_id and m.user_id=p.user_id
 where p.enabled and e.created_at>now()-interval '72 hours' and
 case e.kind when 'low_stock' then p.low_stock when 'overdue_debt' then p.overdue_debt when 'daily_report' then p.daily_report when 'weekly_report' then p.weekly_report else p.monthly_report end
 and (e.kind in ('low_stock','overdue_debt') or local_now::time>=p.report_time)
 and coalesce((business_subscription_state(e.business_id)->>'hasAccess')::boolean,false)
 and exists(select 1 from push_subscriptions s where s.business_id=p.business_id and s.user_id=p.user_id)
 on conflict do nothing;
 for job in select d.*,e.business_id,e.kind,e.subject_id,e.episode,e.title,e.body,e.url from business_push_deliveries d
 join business_push_events e on e.id=d.event_id join notification_preferences p on p.business_id=e.business_id and p.user_id=d.user_id
 join memberships m on m.business_id=p.business_id and m.user_id=p.user_id
 where d.attempts<5 and d.status in ('pending','failed') and d.next_attempt_at<=now() and (d.claimed_at is null or d.claimed_at<now()-interval '5 minutes')
 and e.created_at>now()-interval '72 hours' and p.enabled and
 case e.kind when 'low_stock' then p.low_stock when 'overdue_debt' then p.overdue_debt when 'daily_report' then p.daily_report when 'weekly_report' then p.weekly_report else p.monthly_report end
 and (e.kind in ('low_stock','overdue_debt') or local_now::time>=p.report_time)
 and coalesce((business_subscription_state(e.business_id)->>'hasAccess')::boolean,false)
 order by e.created_at limit 20 for update of d skip locked loop
  latest_body:=job.body;
  if job.kind='low_stock' then
   select left(p.name,120)||' has '||a.quantity||' '||left(p.unit,80)||' remaining (alert at '||p.threshold||').' into latest_body
   from stock_alert_states a join products p on p.business_id=a.business_id and p.id=a.product_id
   where a.business_id=job.business_id and a.product_id=job.subject_id and a.is_low and a.episode=job.episode and p.archived_at is null;
  elsif job.kind='overdue_debt' then
   select total-paid-coalesce((select sum(amount) from payments where business_id=s.business_id and sale_id=s.id),0) into balance
   from sales s where s.business_id=job.business_id and s.id=job.subject_id and s.due_date<local_now::date;
   if balance is null or balance<=0 then latest_body:=null; else
    select left(customer,120)||' owes ₦'||to_char(balance::numeric/100,'FM9999999999999990.00')||' · due '||due_date||'.' into latest_body from sales where business_id=job.business_id and id=job.subject_id;
   end if;
  end if;
  if latest_body is null then update business_push_deliveries set status='skipped' where event_id=job.event_id and user_id=job.user_id; continue; end if;
  update business_push_deliveries set status='pending',attempts=attempts+1,claimed_at=now(),next_attempt_at=now()+interval '5 minutes' where event_id=job.event_id and user_id=job.user_id;
  result:=result||jsonb_build_array(jsonb_build_object('id',job.event_id,'eventId',job.event_id,'businessId',job.business_id,'userId',job.user_id,'kind',job.kind,'title',job.title,'body',latest_body,'url',job.url));
 end loop;
 return result;
end;$$;

alter function public.list_business_reports(uuid) rename to list_business_reports_v1;
revoke all on function public.list_business_reports_v1(uuid) from public,anon,authenticated;
create function public.list_business_reports(bid uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare original jsonb;
begin
 if not is_member(bid) then raise exception 'Workspace access denied'; end if;
 original:=list_business_reports_v1(bid);
 return coalesce((select jsonb_agg(x order by (x->>'generatedAt')::timestamptz desc nulls last) from (
 select x from jsonb_array_elements(original||coalesce((select jsonb_agg(jsonb_build_object('id',id,'status',status,'generatedAt',generated_at,'days',period_end-period_start+1,'kind',kind,'scheduled',true))
 from scheduled_business_reports where business_id=bid and status='ready' and coalesce((business_entitlements(bid)->>'hasAccess')::boolean,false)),'[]'::jsonb)) x
 order by (x->>'generatedAt')::timestamptz desc nulls last limit 100) recent),'[]'::jsonb);
end;$$;
alter function public.get_business_report(uuid,uuid) rename to get_business_report_v1;
revoke all on function public.get_business_report_v1(uuid,uuid) from public,anon,authenticated;
create function public.get_business_report(bid uuid,report_id uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare body jsonb;
begin
 if not is_member(bid) then raise exception 'Workspace access denied'; end if;
 select report into body from scheduled_business_reports where id=report_id and business_id=bid and status='ready' and coalesce((business_entitlements(bid)->>'hasAccess')::boolean,false);
 if body is not null then return body; end if;
 return get_business_report_v1(bid,report_id);
end;$$;
revoke all on function public.capture_stock_alert(uuid,uuid),public.stock_alert_trigger(),public.claim_scheduled_reports(),public.scheduled_report_snapshot(uuid),public.complete_scheduled_report(uuid,jsonb),public.claim_business_push_events(),public.list_business_reports(uuid),public.get_business_report(uuid,uuid) from public,anon,authenticated;
grant execute on function public.claim_scheduled_reports(),public.scheduled_report_snapshot(uuid),public.complete_scheduled_report(uuid,jsonb),public.claim_business_push_events() to service_role;
grant execute on function public.list_business_reports(uuid),public.get_business_report(uuid,uuid) to authenticated;
notify pgrst,'reload schema';
commit;
