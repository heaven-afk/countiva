begin;

-- Public brand assets are shared on customer receipts. Every upload is immutable.
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('business-logos', 'business-logos', true, 2097152, array['image/png', 'image/jpeg', 'image/webp']);

create policy countiva_logo_upload on storage.objects
for insert to authenticated with check (
  bucket_id = 'business-logos'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create function public.setup_business_with_branding(
  workspace_name text, business_type text, business_phone text,
  business_address text, business_logo_url text
) returns uuid language plpgsql security definer set search_path = public as $$
declare business uuid;
begin
  business := public.setup_business(workspace_name, business_type, business_phone, business_address);
  update public.businesses set logo_url = coalesce(business_logo_url, '') where id = business;
  return business;
end; $$;
revoke all on function public.setup_business_with_branding(text,text,text,text,text) from public, anon;
grant execute on function public.setup_business_with_branding(text,text,text,text,text) to authenticated;

notify pgrst, 'reload schema';
commit;
