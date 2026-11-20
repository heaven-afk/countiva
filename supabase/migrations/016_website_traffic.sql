begin;
create table public.website_visits (
 event_id uuid primary key,session_id uuid not null,path text not null,referrer_host text not null default '',created_at timestamptz not null default now(),
 check(path in ('/','/plans','/inventory-management','/sales-tracking','/receipts','/signup','/login')),
 check(length(referrer_host)<=200)
);
create index website_visits_period on website_visits(created_at,path);
create table public.website_visit_rate_limits (key text primary key,window_start timestamptz not null,hits integer not null);
alter table website_visits enable row level security;
alter table website_visit_rate_limits enable row level security;
revoke all on website_visits,website_visit_rate_limits from public,anon,authenticated;
grant all on website_visits,website_visit_rate_limits to service_role;
create function public.record_website_visit(event_ref uuid,session_ref uuid,page_path text,referrer text,rate_key text) returns boolean
language plpgsql security definer set search_path=public as $$
declare allowed integer;
begin
 if rate_key is null or length(rate_key)<>64 or length(coalesce(referrer,''))>200 then raise exception 'Invalid visit'; end if;
 insert into website_visit_rate_limits values(rate_key,date_trunc('minute',now()),1)
 on conflict(key) do update set hits=case when website_visit_rate_limits.window_start<date_trunc('minute',now()) then 1 else website_visit_rate_limits.hits+1 end,
 window_start=date_trunc('minute',now()) returning hits into allowed;
 if allowed>120 then return false; end if;
 insert into website_visits(event_id,session_id,path,referrer_host) values(event_ref,session_ref,page_path,coalesce(referrer,'')) on conflict do nothing;
 delete from website_visit_rate_limits where window_start<now()-interval '1 day';
 delete from website_visits where created_at<now()-interval '90 days';
 return true;
end;$$;
create function public.platform_traffic_summary(period_days integer default 30) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare start_at timestamptz;today date:=(now() at time zone 'Africa/Lagos')::date;
begin
 if platform_access() is null then raise exception 'Platform administrator access required'; end if;
 if period_days not in (7,30,90) then raise exception 'Choose 7, 30 or 90 days'; end if;
 start_at:=(today-period_days+1)::timestamp at time zone 'Africa/Lagos';
 return jsonb_build_object('days',period_days,'asOf',now(),'pageViews',(select count(*) from website_visits where created_at>=start_at),
 'sessions',(select count(distinct session_id) from website_visits where created_at>=start_at),
 'newBusinesses',(select count(*) from businesses where created_at>=start_at),
 'daily',coalesce((select jsonb_agg(to_jsonb(x) order by x."day") from (select d::date as "day",count(v.event_id) views,count(distinct v.session_id) sessions from generate_series(today-period_days+1,today,interval '1 day') d
 left join website_visits v on (v.created_at at time zone 'Africa/Lagos')::date=d::date group by d)x),'[]'::jsonb),
 'pages',coalesce((select jsonb_agg(to_jsonb(x)) from (select path,count(*) views,count(distinct session_id) sessions from website_visits where created_at>=start_at group by path order by views desc)x),'[]'::jsonb),
 'sources',coalesce((select jsonb_agg(to_jsonb(x)) from (select case when referrer_host='' then 'Direct / unknown' else referrer_host end source,count(distinct session_id) sessions from website_visits where created_at>=start_at group by referrer_host order by sessions desc limit 20)x),'[]'::jsonb));
end;$$;
revoke all on function public.record_website_visit(uuid,uuid,text,text,text),public.platform_traffic_summary(integer) from public,anon,authenticated;
grant execute on function public.record_website_visit(uuid,uuid,text,text,text) to service_role;
grant execute on function public.platform_traffic_summary(integer) to authenticated;
notify pgrst,'reload schema';
commit;
