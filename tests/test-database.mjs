import { PGlite } from "@electric-sql/pglite";
import { readFile, readdir } from "node:fs/promises";
export async function testDatabase(maxMigration = Infinity) {
  const db = new PGlite();
  await db.exec(
    "create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text unique,email_confirmed_at timestamptz,raw_user_meta_data jsonb default '{}'::jsonb);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema public,auth to authenticated,service_role;grant execute on function auth.uid() to authenticated;alter default privileges in schema public grant select,insert,update,delete on tables to authenticated;create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(bucket_id text,name text);create function storage.foldername(text) returns text[] language sql as $$select string_to_array($1,'/')$$;alter table storage.objects enable row level security;",
  );
  const dir = new URL("../supabase/migrations/", import.meta.url);
  for (const file of (await readdir(dir))
    .filter(
      (f) => /^0\d\d_.*\.sql$/.test(f) && Number(f.slice(0, 3)) <= maxMigration,
    )
    .sort())
    await db.exec(await readFile(new URL(file, dir), "utf8"));
  const identity = async (id) => {
    await db.exec("set role authenticated");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
  };
  const rpc = async (name, args = []) =>
    (
      await db.query(
        `select ${name}(${args.map((_, i) => `$${i + 1}`).join(",")}) result`,
        args,
      )
    ).rows[0].result;
  return { db, identity, rpc };
}
