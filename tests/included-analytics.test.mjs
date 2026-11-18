import { PGlite } from "@electric-sql/pglite";
import { readFile, readdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { test } from "node:test";

test("included reports enforce active plans, roles, daily caching and tenancy while retaining paid history", async () => {
  const db = new PGlite();
  try {
    await db.exec(
      "create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text unique,email_confirmed_at timestamptz,raw_user_meta_data jsonb default '{}'::jsonb);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema public,auth to authenticated,service_role;grant execute on function auth.uid() to authenticated;alter default privileges in schema public grant select,insert,update,delete on tables to authenticated;create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(bucket_id text,name text);create function storage.foldername(text) returns text[] language sql as $$select string_to_array($1,'/')$$;alter table storage.objects enable row level security;",
    );
    const directory = new URL("../supabase/migrations/", import.meta.url);
    for (const file of (await readdir(directory))
      .filter((n) => /^0\d\d_.*\.sql$/.test(n) && Number(n.slice(0, 3)) < 12)
      .sort())
      await db.exec(await readFile(new URL(file, directory), "utf8"));
    const owner = randomUUID(),
      staff = randomUUID(),
      outsider = randomUUID();
    for (const [id, email] of [
      [owner, "owner@analytics.test"],
      [staff, "staff@analytics.test"],
      [outsider, "other@analytics.test"],
    ])
      await db.query(
        "insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())",
        [id, email],
      );
    const identity = async (id) => {
      await db.exec("set role authenticated");
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
        id,
      ]);
    };
    const rpc = async (name, args) =>
      (
        await db.query(
          `select ${name}(${args.map((_, i) => `$${i + 1}`).join(",")}) as result`,
          args,
        )
      ).rows[0].result;
    await identity(owner);
    const bid = await rpc("setup_business", [
      "Analytics shop",
      "Retail shop",
      "",
      "",
    ]);
    await db.exec("reset role");
    await db.query(
      "insert into memberships(business_id,user_id,role) values($1,$2,'staff')",
      [bid, staff],
    );
    await db.query(
      "insert into subscription_access_grants(business_id,kind,tier,ends_at,created_by,reason) values($1,'manual','starter',now()+interval '1 month',$2,'Analytics test access')",
      [bid, owner],
    );
    await identity(owner);
    const order = await rpc("create_billing_order", [bid, "analytics-report"]);
    await db.exec("reset role");
    await db.query("update billing_orders set status='paid' where id=$1", [
      order.id,
    ]);
    const oldId = randomUUID();
    await db.query(
      "insert into analytics_reports(id,business_id,order_id,status,report,generated_at) values($1,$2,$3,'ready',$4::jsonb,now())",
      [oldId, bid, order.id, JSON.stringify({ days: 30, legacy: true })],
    );
    await db.exec(
      await readFile(new URL("012_included_analytics.sql", directory), "utf8"),
    );
    await identity(owner);
    await assert.rejects(
      rpc("create_billing_order", [bid, "analytics-report"]),
      /unavailable|offer/i,
    );
    assert.equal((await rpc("get_business_report", [bid, oldId])).legacy, true);
    await assert.rejects(rpc("reserve_included_report", [bid, 1]), /Choose/);
    await assert.rejects(rpc("reserve_included_report", [bid, null]), /Choose/);
    const reserved = await rpc("reserve_included_report", [bid, 30]);
    assert.equal(reserved.ready, false);
    assert.ok(Array.isArray(reserved.snapshot.sales));
    await assert.rejects(rpc("reserve_included_report", [bid, 30]), /already/);
    await assert.rejects(
      rpc("complete_business_report", [
        bid,
        reserved.reportId,
        JSON.stringify({ days: 30 }),
      ]),
      /permission denied/,
    );
    await db.exec("reset role; set role service_role");
    await assert.rejects(
      rpc("complete_business_report", [
        bid,
        reserved.reportId,
        JSON.stringify({ days: 7 }),
      ]),
      /period/,
    );
    await rpc("complete_business_report", [
      bid,
      reserved.reportId,
      JSON.stringify({ days: 30, asOf: "2026-11-18T09:00:00Z" }),
    ]);
    // A ready snapshot is immutable even if completion is retried.
    await rpc("complete_business_report", [
      bid,
      reserved.reportId,
      JSON.stringify({ days: 30, asOf: "replacement" }),
    ]);
    await identity(owner);
    const cached = await rpc("reserve_included_report", [bid, 30]);
    assert.equal(cached.ready, true);
    assert.equal(cached.reportId, reserved.reportId);
    assert.equal(cached.report.asOf, "2026-11-18T09:00:00Z");
    assert.equal((await rpc("list_business_reports", [bid])).length, 2);
    await identity(staff);
    assert.equal(
      (await rpc("get_business_report", [bid, reserved.reportId])).days,
      30,
    );
    await assert.rejects(
      rpc("reserve_included_report", [bid, 7]),
      /owner or manager/,
    );
    await identity(outsider);
    await assert.rejects(
      rpc("get_business_report", [bid, reserved.reportId]),
      /access denied/,
    );
    await assert.rejects(rpc("list_business_reports", [bid]), /access denied/);
    await db.exec("reset role");
    await db.query(
      "update subscription_access_grants set tier='growth' where business_id=$1",
      [bid],
    );
    await identity(owner);
    assert.equal((await rpc("reserve_included_report", [bid, 7])).ready, false);
    await db.exec("reset role");
    await db.query(
      "update subscription_access_grants set kind='trial' where business_id=$1",
      [bid],
    );
    await identity(owner);
    assert.equal(
      (await rpc("reserve_included_report", [bid, 90])).ready,
      false,
    );
    await db.exec("reset role");
    await db.query(
      "insert into business_subscription_controls(business_id,paused_at) values($1,now())",
      [bid],
    );
    await identity(owner);
    await assert.rejects(
      rpc("reserve_included_report", [bid, 30]),
      /active subscription/,
    );
    await assert.rejects(
      rpc("get_business_report", [bid, reserved.reportId]),
      /unavailable/,
    );
    assert.equal((await rpc("get_business_report", [bid, oldId])).legacy, true);
  } finally {
    await db.close();
  }
});
