begin;
-- Existing amounts and debts are immutable. NULL original price means unknown history.
alter table public.sale_items add column original_price bigint check(original_price between 0 and 9007199254740991);
alter table public.sales add column due_date date;
-- The foundation insert used positional columns. Preserve its behaviour with an explicit column list.
do $migration$
declare definition text:=pg_get_functiondef('public.sync_workspace_core(uuid,jsonb)'::regprocedure);
begin
 if position('insert into sale_items values(' in definition)=0 then raise exception 'Review sync_workspace_core before installing transaction pricing'; end if;
 execute replace(definition,'insert into sale_items values(','insert into sale_items(business_id,sale_id,position,product_id,name,quantity,unit,price,cost) values(');
end;$migration$;

alter function public.sync_workspace(uuid,jsonb) rename to sync_workspace_v5;
revoke all on function public.sync_workspace_v5(uuid,jsonb) from public,anon,authenticated;
create function public.sync_workspace(bid uuid,payload jsonb) returns jsonb
language plpgsql security definer set search_path=public as $$
declare result jsonb; fresh uuid[]; sale jsonb; line jsonb; position_number integer; due date; n numeric;
begin
 if not is_member(bid) then raise exception 'Workspace access denied'; end if;
 perform 1 from businesses where id=bid for update;
 select array_agg((x->>'id')::uuid) into fresh from jsonb_array_elements(coalesce(payload->'sales','[]'::jsonb)) x
 where not exists(select 1 from sales where business_id=bid and id=(x->>'id')::uuid);
 for sale in select x from jsonb_array_elements(coalesce(payload->'sales','[]'::jsonb)) x where (x->>'id')::uuid=any(coalesce(fresh,'{}'::uuid[])) loop
  if (sale->>'total')::numeric not between 0 and 9007199254740991 then raise exception 'Sale total exceeds supported amount'; end if;
  if nullif(sale->>'dueDate','') is not null then
   if sale->>'dueDate' !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Invalid payment due date'; end if;
   due:=(sale->>'dueDate')::date;
   if due<((sale->>'createdAt')::timestamptz at time zone 'Africa/Lagos')::date then raise exception 'Payment due date cannot precede the sale'; end if;
  end if;
  for line in select value from jsonb_array_elements(sale->'lines') loop
   foreach n in array array[(line->>'price')::numeric,(line->>'cost')::numeric] loop
    if n is null or n<0 or n>9007199254740991 or trunc(n)<>n then raise exception 'Invalid transaction price'; end if;
   end loop;
   if line->>'originalPrice' is not null then
    n:=(line->>'originalPrice')::numeric;
    if n<0 or n>9007199254740991 or trunc(n)<>n then raise exception 'Invalid original price'; end if;
   end if;
  end loop;
  select sum(greatest(0,coalesce((x->>'originalPrice')::numeric,(x->>'price')::numeric)-(x->>'price')::numeric)*(x->>'quantity')::numeric)
   into n from jsonb_array_elements(sale->'lines') x;
  if n>9007199254740991 then raise exception 'Discount total exceeds supported amount'; end if;
 end loop;
 result:=sync_workspace_v5(bid,payload);
 for sale in select x from jsonb_array_elements(coalesce(payload->'sales','[]'::jsonb)) x where (x->>'id')::uuid=any(coalesce(fresh,'{}'::uuid[])) loop
  update sales set due_date=nullif(sale->>'dueDate','')::date where business_id=bid and id=(sale->>'id')::uuid;
  position_number:=0;
  for line in select value from jsonb_array_elements(sale->'lines') loop
   update sale_items set original_price=(line->>'originalPrice')::bigint where business_id=bid and sale_id=(sale->>'id')::uuid and position=position_number;
   position_number:=position_number+1;
  end loop;
 end loop;
 return jsonb_set(result,'{sales}',coalesce((select jsonb_agg(x||jsonb_build_object(
  'dueDate',s.due_date,'recordedBy',s.recorded_by,'recordedByName',left(coalesce(nullif(u.raw_user_meta_data->>'owner_name',''),split_part(u.email,'@',1),'Team member'),120),
  'lines',(select jsonb_agg(l||jsonb_build_object('originalPrice',i.original_price) order by ordinal) from jsonb_array_elements(x->'lines') with ordinality z(l,ordinal)
    join sale_items i on i.business_id=bid and i.sale_id=s.id and i.position=ordinal-1)))
 from jsonb_array_elements(result->'sales') x join sales s on s.business_id=bid and s.id=(x->>'id')::uuid left join auth.users u on u.id=s.recorded_by),'[]'::jsonb));
end;$$;
revoke all on function public.sync_workspace(uuid,jsonb) from public,anon;
grant execute on function public.sync_workspace(uuid,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
