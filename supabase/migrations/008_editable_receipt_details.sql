begin;
-- Optional, editable receipt metadata. Sale totals, lines and repayments stay immutable.
alter table sales add column receipt_details jsonb not null default '{}'::jsonb check(jsonb_typeof(receipt_details)='object' and octet_length(receipt_details::text)<=32000);
alter table sales add column receipt_revision integer not null default 0 check(receipt_revision>=0);
alter table sales add column receipt_updated_at timestamptz;
create table public.receipt_edit_audit (
 id uuid primary key default gen_random_uuid(),business_id uuid not null,sale_id uuid not null,revision integer not null,
 actor_id uuid not null references auth.users(id),previous_details jsonb not null,next_details jsonb not null,created_at timestamptz not null default now(),
 foreign key(business_id,sale_id) references sales(business_id,id),unique(business_id,sale_id,revision)
);
alter table receipt_edit_audit enable row level security;
revoke all on receipt_edit_audit from public,anon,authenticated;
grant all on receipt_edit_audit to service_role;

create function public.validate_receipt_details(bid uuid,sale_ref uuid,details jsonb) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare item jsonb;ids jsonb;value jsonb;chosen text;line_position integer;pid uuid;positions integer[]:='{}';normalized_items jsonb:='[]'::jsonb;entry jsonb;
 customer_name text;phone text;reference_text text;description_text text;item_description text;key_name text;
begin
 if details is null or jsonb_typeof(details) is distinct from 'object' or octet_length(details::text)>32000 then raise exception 'Receipt details must be an object under 32 KB';end if;
 if exists(select 1 from jsonb_object_keys(details) k where k not in ('customerName','customerPhone','reference','description','items')) then raise exception 'Unsupported receipt field';end if;
 foreach key_name in array array['customerName','customerPhone','reference','description'] loop
  if details ? key_name and jsonb_typeof(details->key_name) is distinct from 'string' then raise exception 'Receipt text fields must contain text';end if;
 end loop;
 customer_name:=trim(coalesce(details->>'customerName',''));phone:=trim(coalesce(details->>'customerPhone',''));reference_text:=trim(coalesce(details->>'reference',''));description_text:=trim(coalesce(details->>'description',''));
 if length(customer_name)>300 or length(phone)>40 or phone !~ '^[+]?[0-9 ()-]*$' or length(reference_text)>80 or length(description_text)>1000 then raise exception 'Check the customer, phone, reference and description lengths';end if;
 if jsonb_typeof(coalesce(details->'items','[]'::jsonb)) is distinct from 'array' or jsonb_array_length(coalesce(details->'items','[]'::jsonb))>500 then raise exception 'Use up to 500 receipt item details';end if;
 for item in select x from jsonb_array_elements(coalesce(details->'items','[]'::jsonb)) x loop
  if jsonb_typeof(item) is distinct from 'object' or exists(select 1 from jsonb_object_keys(item) k where k not in ('lineIndex','productId','description','identifierType','identifiers')) then raise exception 'Unsupported receipt item field';end if;
  if jsonb_typeof(item->'lineIndex') is distinct from 'number' or jsonb_typeof(item->'productId') is distinct from 'string' then raise exception 'Identify the original receipt item';end if;
  line_position:=(item->>'lineIndex')::integer;pid:=(item->>'productId')::uuid;
  if line_position is null or line_position not between 0 and 499 or line_position=any(positions) or not exists(select 1 from sale_items where business_id=bid and sale_id=sale_ref and sale_items.position=line_position and product_id=pid) then raise exception 'Receipt item details do not match the original sale';end if;
  positions:=array_append(positions,line_position);
  if item ? 'description' and jsonb_typeof(item->'description') is distinct from 'string' then raise exception 'Item descriptions must contain text';end if;
  item_description:=trim(coalesce(item->>'description',''));chosen:=coalesce(item->>'identifierType','none');ids:=coalesce(item->'identifiers','[]'::jsonb);
  if length(item_description)>500 or chosen not in ('none','imei','serial') or jsonb_typeof(ids) is distinct from 'array' then raise exception 'Choose IMEI or serial number and a description up to 500 characters';end if;
  if jsonb_array_length(ids)>100 or (chosen='none' and jsonb_array_length(ids)>0) then raise exception 'Enter up to 100 identifiers per receipt item and choose their type';end if;
  if (select count(distinct trim(x #>> '{}')) from jsonb_array_elements(ids) x)<>jsonb_array_length(ids) then raise exception 'Remove duplicate identifiers for this item';end if;
  for value in select x from jsonb_array_elements(ids) x loop
   if jsonb_typeof(value) is distinct from 'string' or length(trim(value #>> '{}')) not between 1 and 100 or (value #>> '{}') ~ '[[:cntrl:]]' then raise exception 'Each serial number needs 1-100 characters on its own line';end if;
   if chosen='imei' and trim(value #>> '{}') !~ '^[0-9]{15}$' then raise exception 'Each IMEI must contain exactly 15 digits';end if;
  end loop;
  entry:=jsonb_build_object('lineIndex',line_position,'productId',pid,'description',item_description,'identifierType',chosen,'identifiers',coalesce((select jsonb_agg(trim(x #>> '{}')) from jsonb_array_elements(ids)x),'[]'::jsonb));
  normalized_items:=normalized_items||jsonb_build_array(entry);
 end loop;
 return jsonb_build_object('customerName',customer_name,'customerPhone',phone,'reference',reference_text,'description',description_text,'items',normalized_items);
end;$$;
revoke all on function public.validate_receipt_details(uuid,uuid,jsonb) from public,anon,authenticated;

create function public.get_sale_receipt(bid uuid,sale_ref uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare purchase sales;role_name text;can_edit boolean;
begin
 if not is_member(bid) then raise exception 'Workspace access denied';end if;
 select * into purchase from sales where business_id=bid and id=sale_ref;
 if purchase.id is null then raise exception 'Save this sale online before editing its receipt';end if;
 role_name:=business_role(bid);
 can_edit:=(role_name in ('owner','manager') or purchase.recorded_by=auth.uid()) and (business_subscription_state(bid)->>'hasAccess')::boolean;
 return jsonb_build_object('details',validate_receipt_details(bid,sale_ref,purchase.receipt_details),'revision',purchase.receipt_revision,'updatedAt',purchase.receipt_updated_at,'canEdit',can_edit,
 'history',coalesce((select jsonb_agg(x.body order by x.revision desc) from (select a.revision,jsonb_build_object('revision',a.revision,'editedAt',a.created_at,'editorName',coalesce(nullif(u.raw_user_meta_data->>'owner_name',''),'Team member')) body from receipt_edit_audit a join auth.users u on u.id=a.actor_id where a.business_id=bid and a.sale_id=sale_ref order by a.revision desc limit 20)x),'[]'::jsonb));
end;$$;
create function public.update_sale_receipt(bid uuid,sale_ref uuid,expected_revision integer,details jsonb) returns jsonb language plpgsql security definer set search_path=public as $$
declare purchase sales;normalized jsonb;role_name text;
begin
 if not is_member(bid) then raise exception 'Workspace access denied';end if;
 perform 1 from businesses where id=bid for update;
 select * into purchase from sales where business_id=bid and id=sale_ref for update;
 if purchase.id is null then raise exception 'Save this sale online before editing its receipt';end if;
 role_name:=business_role(bid);
 if role_name not in ('owner','manager') and purchase.recorded_by is distinct from auth.uid() then raise exception 'Only the business owner, manager or original sale recorder can edit this receipt';end if;
 if not (business_subscription_state(bid)->>'hasAccess')::boolean then raise exception 'An active, unpaused subscription is required to edit receipts';end if;
 if expected_revision is null or expected_revision<0 or expected_revision<>purchase.receipt_revision then raise exception 'This receipt changed on another device. Reload the latest receipt before saving';end if;
 normalized:=validate_receipt_details(bid,sale_ref,details);
 if normalized is not distinct from validate_receipt_details(bid,sale_ref,purchase.receipt_details) then return get_sale_receipt(bid,sale_ref);end if;
 update sales set receipt_details=normalized,receipt_revision=receipt_revision+1,receipt_updated_at=now() where business_id=bid and id=sale_ref;
 insert into receipt_edit_audit(business_id,sale_id,revision,actor_id,previous_details,next_details) values(bid,sale_ref,purchase.receipt_revision+1,auth.uid(),purchase.receipt_details,normalized);
 insert into audit_logs(business_id,actor_id,action) values(bid,auth.uid(),'receipt_details_updated');
 return get_sale_receipt(bid,sale_ref);
end;$$;
revoke all on function public.get_sale_receipt(uuid,uuid),public.update_sale_receipt(uuid,uuid,integer,jsonb) from public,anon,authenticated;
grant execute on function public.get_sale_receipt(uuid,uuid),public.update_sale_receipt(uuid,uuid,integer,jsonb) to authenticated;

-- Existing receipt metadata cannot be overwritten by an old offline snapshot.
-- Restored/new receipts can bring their optional fields with their first upload.
alter function public.sync_workspace(uuid,jsonb) rename to sync_workspace_v3;
revoke all on function public.sync_workspace_v3(uuid,jsonb) from public,anon,authenticated;
create function public.sync_workspace(bid uuid,payload jsonb) returns jsonb language plpgsql security definer set search_path=public as $$
declare result jsonb;cleaned jsonb;fresh_ids uuid[];item jsonb;normalized jsonb;
begin
 if not is_member(bid) then raise exception 'Workspace access denied';end if;
 perform 1 from businesses where id=bid for update;
 select array_agg((x->>'id')::uuid) into fresh_ids from jsonb_array_elements(coalesce(payload->'sales','[]'::jsonb)) x where not exists(select 1 from sales where business_id=bid and id=(x->>'id')::uuid);
 cleaned:=jsonb_set(payload,'{sales}',coalesce((select jsonb_agg(x-'receiptDetails'-'receiptRevision'-'receiptUpdatedAt') from jsonb_array_elements(coalesce(payload->'sales','[]'::jsonb)) x),'[]'::jsonb));
 result:=sync_workspace_v3(bid,cleaned);
 for item in select x from jsonb_array_elements(coalesce(payload->'sales','[]'::jsonb)) x where (x->>'id')::uuid=any(coalesce(fresh_ids,'{}'::uuid[])) and x ? 'receiptDetails' loop
  normalized:=validate_receipt_details(bid,(item->>'id')::uuid,item->'receiptDetails');
  update sales set receipt_details=normalized where business_id=bid and id=(item->>'id')::uuid;
  insert into receipt_edit_audit(business_id,sale_id,revision,actor_id,previous_details,next_details) values(bid,(item->>'id')::uuid,0,auth.uid(),'{}'::jsonb,normalized);
 end loop;
 return jsonb_set(result,'{sales}',coalesce((select jsonb_agg(x||jsonb_build_object('receiptDetails',s.receipt_details,'receiptRevision',s.receipt_revision,'receiptUpdatedAt',s.receipt_updated_at)) from jsonb_array_elements(result->'sales') x join sales s on s.business_id=bid and s.id=(x->>'id')::uuid),'[]'::jsonb));
end;$$;
revoke all on function public.sync_workspace(uuid,jsonb) from public,anon;
grant execute on function public.sync_workspace(uuid,jsonb) to authenticated;
commit;
