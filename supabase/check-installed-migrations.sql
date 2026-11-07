-- READ ONLY: run this entire query in the SAME Supabase project's SQL Editor.
-- This checks current schema objects, not historical execution dates or live services.
-- PRESENT does not prove function bodies, permissions, payments or email work.
-- Do not blindly rerun migrations reported as PARTIAL.
with expected(migration,feature,objects) as (values
 ('001','Inventory, sales and account foundation',
  '{"table":["businesses","memberships","products","stock_movements","sales","sale_items","payments","scan_usage","audit_logs"],"function":["is_member(uuid)","create_workspace(text)","reserve_scan()","sync_workspace(uuid,jsonb)"]}'::jsonb),
 ('002','Business onboarding',
  '{"column":["businesses.business_type","businesses.phone","businesses.address"],"function":["setup_business(text,text,text,text)"]}'::jsonb),
 ('003','Staff invitations and business settings',
  '{"table":["staff_invitations"],"column":["businesses.receipt_footer","businesses.receipt_width","businesses.logo_url"],"function":["business_role(uuid)","may_scan_stock()","invite_staff(uuid,text,text)","my_invitations()","accept_staff_invitation(uuid)","business_team(uuid)","update_team_access(uuid,uuid,text)","revoke_staff_invitation(uuid,uuid)","update_business_settings(uuid,jsonb)"]}'::jsonb),
 ('004','Platform administration',
  '{"table":["platform_admins","platform_audit","device_sync_health"],"function":["platform_access()","platform_dashboard()","set_platform_access(text,text)"]}'::jsonb),
 ('005','Authorised saves and receipt branding',
  '{"column":["sales.receipt_branding"],"function":["sync_workspace_core(uuid,jsonb)"]}'::jsonb),
 ('006','Billing, subscriptions, scans, insights and reminders',
  '{"table":["billing_catalog","billing_orders","subscription_terms","billing_events","legacy_billing_access","stock_scan_requests","analytics_reports","notification_preferences","push_subscriptions","business_activity","notification_deliveries","daily_business_insights"],"column":["businesses.receipt_template"],"function":["business_entitlements(uuid)","create_billing_order(uuid,text)","business_billing_history(uuid)","apply_verified_billing_payment(uuid,text,text,bigint,text,text,text)","reverse_billing_payment(text,text,text)","invite_staff_v1(uuid,text,text)","accept_staff_invitation_v1(uuid)","update_business_settings_v1(uuid,jsonb)","sync_workspace_v1(uuid,jsonb)","visit_workspace(uuid)","begin_stock_scan(uuid)","finish_stock_scan(uuid,boolean)","apply_stock_scan(uuid,uuid,jsonb)","get_notification_preferences(uuid)","save_notification_preferences(uuid,jsonb)","save_push_subscription(uuid,jsonb)","list_business_reports(uuid)","reserve_business_report(uuid,uuid)","complete_business_report(uuid,uuid,jsonb)","get_business_report(uuid,uuid)","reserve_daily_insight(uuid)","complete_daily_insight(uuid,jsonb)","claim_due_reminders()"]}'::jsonb),
 ('007','Admin subscription management and free Growth trials',
  '{"table":["business_subscription_controls","subscription_access_grants","subscription_admin_events"],"function":["business_subscription_state(uuid)","platform_manage_subscription(uuid,text,jsonb)","platform_subscriptions(text,text,integer,integer)","platform_subscription_history(uuid)","sync_workspace_v2(uuid,jsonb)","create_billing_order_v2(uuid,text)","platform_dashboard_v1()","apply_verified_billing_payment_v2(uuid,text,text,bigint,text,text,text)"]}'::jsonb),
 ('008','Editable receipt descriptions, IMEI and serial numbers',
  '{"table":["receipt_edit_audit"],"column":["sales.receipt_details","sales.receipt_revision","sales.receipt_updated_at"],"function":["validate_receipt_details(uuid,uuid,jsonb)","get_sale_receipt(uuid,uuid)","update_sale_receipt(uuid,uuid,integer,jsonb)","sync_workspace_v3(uuid,jsonb)"]}'::jsonb),
 ('009','One-time free Growth trial notifications',
  '{"table":["business_notifications"],"function":["notify_growth_trial()","list_business_notifications(uuid)","read_business_notification(uuid,uuid)"],"trigger":["subscription_access_grants.growth_trial_notification"]}'::jsonb)
), checks as (
 select e.migration,e.feature,k.key as kind,v.value as object_name,
 case k.key
  when 'table' then exists(select 1 from pg_catalog.pg_class c where c.oid=to_regclass('public.'||v.value) and c.relkind in ('r','p'))
  when 'function' then to_regprocedure('public.'||v.value) is not null
  when 'column' then exists(select 1 from pg_catalog.pg_attribute a where a.attrelid=to_regclass('public.'||split_part(v.value,'.',1)) and a.attname=split_part(v.value,'.',2) and a.attnum>0 and not a.attisdropped)
  when 'trigger' then exists(select 1 from pg_catalog.pg_trigger t where t.tgrelid=to_regclass('public.'||split_part(v.value,'.',1)) and t.tgname=split_part(v.value,'.',2) and not t.tgisinternal and t.tgenabled in ('O','A'))
  else false
 end as found
 from expected e cross join lateral jsonb_each(e.objects) k cross join lateral jsonb_array_elements_text(k.value) v
), report as (
 select migration,feature,count(*)::integer as expected_objects,count(*) filter(where found)::integer as present_objects,
 coalesce(array_agg(kind||': public.'||object_name order by kind,object_name) filter(where not found),array[]::text[]) as missing_objects
 from checks group by migration,feature
)
select migration,feature,
 case when present_objects=expected_objects then 'PRESENT (structural check)'
      when present_objects=0 then 'NOT DETECTED'
      else 'PARTIAL - REVIEW BEFORE RUNNING SQL' end as status,
 present_objects,expected_objects,missing_objects,
 case when exists(select 1 from report earlier where earlier.migration<r.migration and earlier.present_objects<earlier.expected_objects)
      then 'Check earlier migrations first'
      when present_objects=expected_objects then 'Do not rerun; schema objects are present'
      when present_objects=0 then 'Candidate for installation after confirming project and prior migrations'
      else 'Inspect missing objects; do not rerun the full migration blindly' end as next_step
from report r order by migration;
