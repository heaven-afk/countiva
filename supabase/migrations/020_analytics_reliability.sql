begin;
-- Daily narratives are cached by analysis level; live financials are refreshed by the API.
alter table public.daily_business_insights add column analysis_level text check(analysis_level in ('growth','business'));
create or replace function public.reserve_daily_insight(bid uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare level text; saved daily_business_insights; result jsonb;
begin
 level:=analytics_access_level(bid);
 if coalesce(business_role(bid),'') not in ('owner','manager') then raise exception 'Only an owner or manager can create an AI brief';end if;
 perform 1 from businesses where id=bid for update;
 select * into saved from daily_business_insights where business_id=bid and insight_date=(now() at time zone 'Africa/Lagos')::date for update;
 if saved.status='ready' and (saved.analysis_level is null or (level='business' and saved.analysis_level<>'business')) then
  update daily_business_insights set status='failed',claimed_at=now()-interval '16 minutes' where business_id=bid and insight_date=saved.insight_date;
 end if;
 result:=reserve_daily_insight_packages_v1(bid)||jsonb_build_object('analyticsLevel',level);
 if result->>'cached'='false' then update daily_business_insights set analysis_level=level where business_id=bid and insight_date=(now() at time zone 'Africa/Lagos')::date and status='processing';end if;
 if result->>'cached'='true' and level='growth' then
  result:=jsonb_set(result,'{body,brief,observations}',coalesce((select jsonb_agg(x) from (select value x from jsonb_array_elements(result->'body'->'brief'->'observations') limit 2) a),'[]'::jsonb));
  result:=jsonb_set(result,'{body,brief,actions}',coalesce((select jsonb_agg(x) from (select value x from jsonb_array_elements(result->'body'->'brief'->'actions') limit 2) a),'[]'::jsonb));
 end if;
 return result;
end;$$;
create or replace function public.complete_daily_insight(bid uuid,body_data jsonb) returns void
language plpgsql security definer set search_path=public as $$
declare completed_level text;
begin
 select coalesce(body_data->>'analysisLevel',analysis_level) into completed_level from daily_business_insights where business_id=bid and insight_date=(now() at time zone 'Africa/Lagos')::date;
 if completed_level is null or completed_level not in ('growth','business') then raise exception 'An analysis level is required';end if;
 update daily_business_insights set body=body_data,status='ready',analysis_level=completed_level
 where business_id=bid and insight_date=(now() at time zone 'Africa/Lagos')::date and status='processing';
end;$$;

create or replace function public.reserve_included_report(bid uuid,days integer) returns jsonb
language plpgsql security definer set search_path=public as $$
declare saved analytics_reports; today date:=(now() at time zone 'Africa/Lagos')::date; level text; enrich boolean;
begin
 level:=analytics_access_level(bid,days);
 if coalesce(business_role(bid),'') not in ('owner','manager') then raise exception 'Only an owner or manager can prepare a detailed report';end if;
 if days is null or days not in (1,7,30,90) then raise exception 'Choose 1, 7, 30 or 90 days';end if;
 perform 1 from businesses where id=bid for update;
 insert into analytics_reports(business_id,report_day,period_days) values(bid,today,days) on conflict do nothing;
 select * into saved from analytics_reports where business_id=bid and order_id is null and report_day=today and period_days=days for update;
 enrich:=saved.status='ready' and (
  (level='business' and coalesce(saved.report->>'analysisLevel','growth')<>'business')
  or (saved.report->>'aiAvailable'='false' and saved.generated_at<now()-interval '5 minutes'));
 if saved.status='ready' and not enrich then
  return jsonb_build_object('ready',true,'reportId',saved.id,'analyticsLevel',level,'report',scope_analytics_report(saved.report,level));
 end if;
 if saved.status='processing' and saved.processing_at>now()-interval '5 minutes' then raise exception 'This report is already being prepared. Try again shortly';end if;
 update analytics_reports set status='processing',processing_at=now() where id=saved.id;
 if enrich then return jsonb_build_object('ready',false,'reportId',saved.id,'analyticsLevel',level,'calculated',saved.report);end if;
 return jsonb_build_object('ready',false,'reportId',saved.id,'analyticsLevel',level,'snapshot',sync_workspace(bid,'{"products":[],"movements":[],"sales":[],"payments":[]}'::jsonb));
end;$$;
notify pgrst,'reload schema';
commit;
