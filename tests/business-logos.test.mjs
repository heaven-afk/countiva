import { PGlite } from "@electric-sql/pglite";
import { readFile, readdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { test } from "node:test";

test("logos upload only to the signed-in account and onboarding saves branding atomically", async () => {
  const db = new PGlite();
  try {
    await db.exec(
      "create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text unique,email_confirmed_at timestamptz,raw_user_meta_data jsonb default '{}'::jsonb);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema public,auth to authenticated,service_role;grant execute on function auth.uid() to authenticated;alter default privileges in schema public grant select,insert,update,delete on tables to authenticated;create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(bucket_id text,name text,unique(bucket_id,name));create function storage.foldername(text) returns text[] language sql as $$select string_to_array($1,'/')$$;alter table storage.objects enable row level security;grant usage on schema storage to authenticated;grant insert,select,update,delete on storage.objects to authenticated;",
    );
    const directory = new URL("../supabase/migrations/", import.meta.url);
    for (const file of (await readdir(directory))
      .filter((name) => /^0\d\d_.*\.sql$/.test(name))
      .sort()) {
      await db.exec(await readFile(new URL(file, directory), "utf8"));
    }
    const owner = randomUUID(),
      other = randomUUID();
    await db.query(
      "insert into auth.users(id,email,email_confirmed_at) values($1,'owner@logo.test',now()),($2,'other@logo.test',now())",
      [owner, other],
    );
    const identity = async (id) => {
      await db.exec("set role authenticated");
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
        id,
      ]);
    };
    await identity(owner);
    await db.query("insert into storage.objects values('business-logos',$1)", [
      `${owner}/${randomUUID()}.png`,
    ]);
    await assert.rejects(
      db.query("insert into storage.objects values('business-logos',$1)", [
        `${other}/logo.png`,
      ]),
      /row-level security/,
    );
    assert.equal(
      (await db.query("select * from storage.objects")).rows.length,
      0,
      "public assets cannot be listed using the upload policy",
    );
    const logo = `https://example.supabase.co/storage/v1/object/public/business-logos/${owner}/logo.png`;
    const { rows } = await db.query(
      "select setup_business_with_branding('Logo shop','Retail shop','','',$1) as id",
      [logo],
    );
    const businessId = rows[0].id;
    assert.equal(
      (
        await db.query("select logo_url from businesses where id=$1", [
          businessId,
        ])
      ).rows[0].logo_url,
      logo,
    );
    await identity(other);
    await assert.rejects(
      db.query(
        "select setup_business_with_branding('Invalid logo','Retail shop','','','javascript:alert(1)')",
      ),
      /check constraint/,
    );
    assert.equal(
      (await db.query("select * from businesses")).rows.length,
      0,
      "invalid branding rolls back the entire new workspace",
    );
    await db.query(
      "select setup_business('Existing setup','Retail shop','','')",
    );
    await assert.rejects(
      db.query("select update_business_settings($1,$2::jsonb)", [
        businessId,
        JSON.stringify({ logo_url: "" }),
      ]),
      /Only the business owner/,
    );
    await db.exec("reset role");
    const bucket = (
      await db.query("select * from storage.buckets where id='business-logos'")
    ).rows[0];
    assert.equal(bucket.public, true);
    assert.equal(Number(bucket.file_size_limit), 2097152);
    assert.deepEqual(bucket.allowed_mime_types, [
      "image/png",
      "image/jpeg",
      "image/webp",
    ]);
  } finally {
    await db.close();
  }
});
