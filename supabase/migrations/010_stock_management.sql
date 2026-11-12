begin;

alter table public.products add column revision integer not null default 0;
alter table public.products add column archived_at timestamptz;

create table public.stock_audit_log (
  id bigint generated always as identity primary key,
  business_id uuid not null references public.businesses(id),
  product_id uuid not null,
  product_name text not null,
  actor_id uuid references auth.users(id) on delete set null,
  actor_email text,
  action text not null check (action in ('created', 'edited', 'deleted', 'adjusted')),
  before_details jsonb,
  after_details jsonb,
  created_at timestamptz not null default clock_timestamp()
);
create index stock_audit_log_business on public.stock_audit_log(business_id, id desc);
alter table public.stock_audit_log enable row level security;
revoke all on public.stock_audit_log from public, anon, authenticated;
alter policy audit_read on public.audit_logs using (public.business_role(business_id) = 'owner');

create function public.record_stock_audit() returns trigger
language plpgsql security definer set search_path = public as $$
declare entry_action text; old_details jsonb; new_details jsonb; item_name text;
begin
  if tg_table_name = 'stock_movements' then
    entry_action := 'adjusted';
    new_details := jsonb_build_object('quantity', new.quantity, 'reason', new.reason);
    select name into item_name from products where business_id = new.business_id and id = new.product_id;
    insert into stock_audit_log(business_id, product_id, product_name, actor_id, actor_email, action, after_details)
    values(new.business_id, new.product_id, item_name, new.recorded_by,
           (select email from auth.users where id = new.recorded_by), entry_action, new_details);
    return new;
  end if;

  new_details := to_jsonb(new) - array['business_id', 'id', 'revision', 'archived_at'];
  if tg_op = 'INSERT' then
    entry_action := 'created';
  elsif old.archived_at is null and new.archived_at is not null then
    entry_action := 'deleted';
    old_details := to_jsonb(old) - array['business_id', 'id', 'revision', 'archived_at'];
    new_details := null;
  else
    old_details := to_jsonb(old) - array['business_id', 'id', 'revision', 'archived_at'];
    if old_details = new_details then return new; end if;
    entry_action := 'edited';
  end if;
  insert into stock_audit_log(business_id, product_id, product_name, actor_id, actor_email, action, before_details, after_details)
  values(new.business_id, new.id, new.name, auth.uid(),
         (select email from auth.users where id = auth.uid()), entry_action, old_details, new_details);
  return new;
end; $$;
revoke all on function public.record_stock_audit() from public, anon, authenticated;
create trigger product_stock_audit after insert or update on public.products
for each row execute function public.record_stock_audit();
create trigger movement_stock_audit after insert on public.stock_movements
for each row execute function public.record_stock_audit();

create function public.update_stock_product(bid uuid, product_ref uuid, expected_revision integer, details jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare item products; requested_stock integer; current_stock bigint;
begin
  if not is_member(bid) then raise exception 'Workspace access denied'; end if;
  perform 1 from businesses where id = bid for update;
  if business_role(bid) is null then raise exception 'Workspace access denied'; end if;
  if not (business_subscription_state(bid)->>'hasAccess')::boolean then
    raise exception 'An active subscription is required to edit stock';
  end if;
  select * into item from products where business_id = bid and id = product_ref and archived_at is null;
  if not found then raise exception 'This product is unavailable. Refresh inventory and try again'; end if;
  if item.revision is distinct from expected_revision then
    raise exception 'This product changed on another device. Close the form and reopen the product';
  end if;
  if jsonb_typeof(details) is distinct from 'object' or octet_length(details::text) > 3000
     or coalesce(length(trim(details->>'name')), 0) not between 1 and 120
     or coalesce(length(trim(details->>'category')), 0) not between 1 and 100
     or coalesce(length(trim(details->>'unit')), 0) not between 1 and 80
     or coalesce(details->>'cost', '') !~ '^[0-9]+$' or (details->>'cost')::numeric > 9007199254740991
     or coalesce(details->>'price', '') !~ '^[0-9]+$' or (details->>'price')::numeric > 9007199254740991
     or coalesce(details->>'threshold', '') !~ '^[0-9]+$' or (details->>'threshold')::numeric > 2147483647 then
    raise exception 'Enter valid product details, prices and threshold';
  end if;
  if details ? 'stock' then
    if coalesce(details->>'stock', '') !~ '^[0-9]+$' or (details->>'stock')::numeric > 2147483647 then
      raise exception 'Enter a nonnegative whole stock quantity';
    end if;
    requested_stock := (details->>'stock')::integer;
    select coalesce((select sum(quantity) from stock_movements where business_id = bid and product_id = product_ref), 0)
           - coalesce((select sum(quantity) from sale_items where business_id = bid and product_id = product_ref), 0)
      into current_stock;
    if current_stock is distinct from (details->>'expectedStock')::bigint then
      raise exception 'Stock changed on another device. Close the form and reopen the product';
    end if;
    if requested_stock <> current_stock then
      insert into stock_movements(business_id, id, product_id, quantity, reason, created_at, recorded_by)
      values(bid, gen_random_uuid(), product_ref, requested_stock - current_stock, 'Inventory count correction', now(), auth.uid());
      insert into business_activity(business_id, last_stock_at) values(bid, now())
      on conflict (business_id) do update set last_stock_at = excluded.last_stock_at;
    end if;
  end if;
  update products set name = trim(details->>'name'), category = trim(details->>'category'), unit = trim(details->>'unit'),
    cost = (details->>'cost')::bigint, price = (details->>'price')::bigint, threshold = (details->>'threshold')::integer,
    revision = revision + 1 where business_id = bid and id = product_ref;
end; $$;

create function public.delete_stock_product(bid uuid, product_ref uuid, expected_revision integer) returns void
language plpgsql security definer set search_path = public as $$
begin
  if business_role(bid) is distinct from 'owner' then raise exception 'Only the store owner can delete products'; end if;
  perform 1 from businesses where id = bid for update;
  if business_role(bid) is distinct from 'owner' then raise exception 'Only the store owner can delete products'; end if;
  if not (business_subscription_state(bid)->>'hasAccess')::boolean then
    raise exception 'An active subscription is required to delete stock';
  end if;
  update products set archived_at = now(), revision = revision + 1
   where business_id = bid and id = product_ref and archived_at is null and revision = expected_revision;
  if not found then raise exception 'This product has changed or was deleted. Refresh inventory'; end if;
end; $$;

create function public.list_stock_audit(bid uuid, before_id bigint default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if business_role(bid) is distinct from 'owner' then raise exception 'Only the store owner can view stock logs'; end if;
  return coalesce((select jsonb_agg(to_jsonb(entry) order by entry.id desc) from (
    select id, product_name, actor_email, action, before_details, after_details, created_at
    from stock_audit_log where business_id = bid and (before_id is null or id < before_id)
    order by id desc limit 30
  ) entry), '[]'::jsonb);
end; $$;

-- Keep archived product references in the journal so sales and backups remain valid.
alter function public.sync_workspace(uuid,jsonb) rename to sync_workspace_v4;
revoke all on function public.sync_workspace_v4(uuid,jsonb) from public, anon, authenticated;
create function public.sync_workspace(bid uuid, payload jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare result jsonb;
begin
  result := sync_workspace_v4(bid, payload);
  return jsonb_set(result, '{products}', coalesce((
    select jsonb_agg(entry || jsonb_build_object('revision', p.revision, 'archivedAt', p.archived_at))
    from jsonb_array_elements(result->'products') entry
    join products p on p.business_id = bid and p.id = (entry->>'id')::uuid
  ), '[]'::jsonb));
end; $$;

-- Validate the selected products while holding the same lock as archive and sync.
alter function public.apply_stock_scan(uuid,uuid,jsonb) rename to apply_stock_scan_v1;
revoke all on function public.apply_stock_scan_v1(uuid,uuid,jsonb) from public, anon, authenticated;
create function public.apply_stock_scan(bid uuid, ticket_id uuid, rows jsonb) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(business_role(bid), '') not in ('owner', 'manager') then
    raise exception 'Only an owner or manager can receive stock';
  end if;
  perform 1 from businesses where id = bid for update;
  if jsonb_typeof(rows) = 'array' and exists (
    select 1 from stock_scan_requests where id = ticket_id and business_id = bid and user_id = auth.uid() and status = 'ready'
  ) and exists (
    select 1 from jsonb_array_elements(rows) entry join products p on p.business_id = bid
      and p.id = nullif(entry->>'productId', '')::uuid where p.archived_at is not null
  ) then raise exception 'A selected product has been deleted. Choose an active product'; end if;
  return apply_stock_scan_v1(bid, ticket_id, rows);
end; $$;
revoke all on function public.apply_stock_scan(uuid,uuid,jsonb) from public, anon, authenticated;
grant execute on function public.apply_stock_scan(uuid,uuid,jsonb) to authenticated;

revoke all on function public.update_stock_product(uuid,uuid,integer,jsonb),
  public.delete_stock_product(uuid,uuid,integer), public.list_stock_audit(uuid,bigint),
  public.sync_workspace(uuid,jsonb) from public, anon, authenticated;
grant execute on function public.update_stock_product(uuid,uuid,integer,jsonb),
  public.delete_stock_product(uuid,uuid,integer), public.list_stock_audit(uuid,bigint),
  public.sync_workspace(uuid,jsonb) to authenticated;
notify pgrst, 'reload schema';
commit;
