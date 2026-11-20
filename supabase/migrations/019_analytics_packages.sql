begin;
do $$ begin if to_regprocedure('public.package_limits(text)') is null then raise exception 'Apply migration 018 before 019';end if;end $$;
-- Growth provides standard insight; Business provides the complete breakdown.
create function public.analytics_access_level(bid uuid,days integer default null) returns text language plpgsql stable security definer set search_path=public as $$
declare access jsonb;level text;
begin
 if not is_member(bid) then raise exception 'Workspace access denied';end if;
 access:=business_subscription_state(bid);
 if not coalesce((access->>'hasAccess')::boolean,false) then raise exception 'An active subscription or trial is required';end if;
 level:=case when access->>'tier'='starter' then 'none' when access->>'tier'='business' then 'business' else 'growth' end;
 -- Honour the detailed-report access already granted on historical Growth contracts.
 if access->>'tier'='growth' and access->>'source' in ('payment','trial','manual') then
  if access->>'source'='payment' then
   if (select capacity_snapshot->>'analytics' from subscription_terms where business_id=bid and revoked_at is null and starts_at<=now() and ends_at>now() order by ends_at desc limit 1)='business' then level:='business';end if;
  elsif (select capacity_snapshot->>'analytics' from subscription_access_grants where business_id=bid and revoked_at is null and starts_at<=now() and ends_at>now() order by created_at desc,id desc limit 1)='business' then level:='business';end if;
 end if;
 if level='none' then raise exception 'Business insights are available on Growth and Business plans. Upgrade to unlock them';end if;
 if days>31 and level<>'business' then raise exception 'Reports beyond 30 days require the Business plan';end if;
 return level;
end;$$;
-- Public entitlements expose the analytics level without calling the member-only guard recursively.
create or replace function public.business_entitlements(bid uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare access jsonb;level text:='none';
begin
 if not is_member(bid) then raise exception 'Workspace access denied';end if;
 access:=business_subscription_state(bid);
 if access->>'tier'<>'starter' and coalesce((access->>'hasAccess')::boolean,false) then level:=analytics_access_level(bid);end if;
 return access||jsonb_build_object('analyticsLevel',level);
end;$$;
create function public.scope_analytics_report(body jsonb,level text) returns jsonb language sql immutable set search_path=public as $$
 select case when level='business' then body else
 (body-'intelligence')||jsonb_build_object('products','[]'::jsonb,'creditAge','[]'::jsonb,'paymentMix','[]'::jsonb,
 'insights',coalesce((select jsonb_agg(x) from (select value x from jsonb_array_elements(coalesce(body->'insights','[]'::jsonb)) limit 3) a),'[]'::jsonb),
 'aiSummary',case when jsonb_typeof(body->'aiSummary')='object' then (body->'aiSummary')||jsonb_build_object(
 'observations',coalesce((select jsonb_agg(x) from (select value x from jsonb_array_elements(body->'aiSummary'->'observations') limit 2) a),'[]'::jsonb),
 'actions',coalesce((select jsonb_agg(x) from (select value x from jsonb_array_elements(body->'aiSummary'->'actions') limit 2) a),'[]'::jsonb)) else null end)
 end
$$;

alter function public.reserve_included_report(uuid,integer) rename to reserve_included_report_packages_v1;
revoke all on function public.reserve_included_report_packages_v1(uuid,integer) from public,anon,authenticated;
create function public.reserve_included_report(bid uuid,days integer) returns jsonb language plpgsql security definer set search_path=public as $$
declare level text;result jsonb;
begin
 level:=analytics_access_level(bid,days);
 result:=reserve_included_report_packages_v1(bid,days);
 result:=result||jsonb_build_object('analyticsLevel',level);
 if result->>'ready'='true' then perform analytics_access_level(bid,(result->'report'->>'days')::integer);result:=jsonb_set(result,'{report}',scope_analytics_report(result->'report',level));end if;
 return result;
end;$$;
revoke all on function public.reserve_included_report(uuid,integer) from public,anon;
grant execute on function public.reserve_included_report(uuid,integer) to authenticated;

alter function public.reserve_business_report(uuid,uuid) rename to reserve_business_report_packages_v1;
revoke all on function public.reserve_business_report_packages_v1(uuid,uuid) from public,anon,authenticated;
create function public.reserve_business_report(bid uuid,report_id uuid) returns jsonb language plpgsql security definer set search_path=public as $$
declare level text;result jsonb;
begin
 level:=analytics_access_level(bid,null);
 result:=reserve_business_report_packages_v1(bid,report_id);
 result:=result||jsonb_build_object('analyticsLevel',level);
 if result->>'ready'='true' then result:=jsonb_set(result,'{report}',scope_analytics_report(result->'report',level));end if;
 return result;
end;$$;
revoke all on function public.reserve_business_report(uuid,uuid) from public,anon;
grant execute on function public.reserve_business_report(uuid,uuid) to authenticated;

alter function public.reserve_daily_insight(uuid) rename to reserve_daily_insight_packages_v1;
revoke all on function public.reserve_daily_insight_packages_v1(uuid) from public,anon,authenticated;
create function public.reserve_daily_insight(bid uuid) returns jsonb language plpgsql security definer set search_path=public as $$
declare level text;result jsonb;
begin
 level:=analytics_access_level(bid,null);
 result:=reserve_daily_insight_packages_v1(bid);
 result:=result||jsonb_build_object('analyticsLevel',level);
 if result->>'ready'='true' then result:=jsonb_set(result,'{report}',scope_analytics_report(result->'report',level));end if;if result->>'cached'='true' and level='growth' then
 result:=jsonb_set(result,'{body,brief,observations}',coalesce((select jsonb_agg(x) from (select value x from jsonb_array_elements(result->'body'->'brief'->'observations') limit 2) a),'[]'::jsonb));
 result:=jsonb_set(result,'{body,brief,actions}',coalesce((select jsonb_agg(x) from (select value x from jsonb_array_elements(result->'body'->'brief'->'actions') limit 2) a),'[]'::jsonb));end if;
 return result;
end;$$;
revoke all on function public.reserve_daily_insight(uuid) from public,anon;
grant execute on function public.reserve_daily_insight(uuid) to authenticated;

alter function public.get_business_report(uuid,uuid) rename to get_business_report_packages_v1;
revoke all on function public.get_business_report_packages_v1(uuid,uuid) from public,anon,authenticated;
create function public.get_business_report(bid uuid,report_id uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare level text;result jsonb;
begin
 level:=analytics_access_level(bid,null);
 result:=get_business_report_packages_v1(bid,report_id);
 perform analytics_access_level(bid,(result->>'days')::integer); result:=scope_analytics_report(result,level);
 return result;
end;$$;
revoke all on function public.get_business_report(uuid,uuid) from public,anon;
grant execute on function public.get_business_report(uuid,uuid) to authenticated;

alter function public.list_business_reports(uuid) rename to list_business_reports_packages_v1;
revoke all on function public.list_business_reports_packages_v1(uuid) from public,anon,authenticated;
create function public.list_business_reports(bid uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare level text;result jsonb;
begin
 level:=analytics_access_level(bid,null);
 result:=list_business_reports_packages_v1(bid);
 if level='growth' then select coalesce(jsonb_agg(x),'[]'::jsonb) into result from jsonb_array_elements(result) x where coalesce((x->>'days')::integer,30)<=31;end if;
 return result;
end;$$;
revoke all on function public.list_business_reports(uuid) from public,anon;
grant execute on function public.list_business_reports(uuid) to authenticated;
create or replace function public.claim_scheduled_reports() returns jsonb language plpgsql security definer set search_path=public as $$
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
  and coalesce((business_subscription_state(p.business_id)->>'hasAccess')::boolean,false) and business_subscription_state(p.business_id)->>'tier'<>'starter'
 on conflict do nothing;
 for saved in select * from scheduled_business_reports r where (r.status='pending' or (r.status='processing' and r.claimed_at<now()-interval '5 minutes'))
 and r.period_end>local_now::date-40 and coalesce((business_subscription_state(r.business_id)->>'hasAccess')::boolean,false) and business_subscription_state(r.business_id)->>'tier'<>'starter'
 order by r.period_end desc,r.id limit 2 for update skip locked loop
  update scheduled_business_reports set status='processing',claimed_at=now() where id=saved.id;
  result:=result||jsonb_build_array(jsonb_build_object('id',saved.id,'businessId',saved.business_id,'kind',saved.kind,'startDate',saved.period_start,'endDate',saved.period_end,'days',saved.period_end-saved.period_start+1));
 end loop;
 return result;
end;$$;


revoke all on function public.analytics_access_level(uuid,integer),public.scope_analytics_report(jsonb,text) from public,anon,authenticated;
notify pgrst,'reload schema';
commit;
