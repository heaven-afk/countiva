import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { test } from "node:test";

test("read-only migration report detects each upgrade, an empty database, and missing admin functions", async () => {
  const db = new PGlite();
  try {
    await db.exec(
      "create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text unique,email_confirmed_at timestamptz,raw_user_meta_data jsonb default '{}'::jsonb);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema public,auth to authenticated,service_role;grant execute on function auth.uid() to authenticated;alter default privileges in schema public grant select,insert,update,delete on tables to authenticated;",
    );
    const query = await readFile(
      new URL("../supabase/check-installed-migrations.sql", import.meta.url),
      "utf8",
    );
    const report = async () => {
      // The complete diagnostic must also work in an enforced read-only transaction.
      await db.exec("begin read only");
      try {
        return (await db.query(query)).rows;
      } finally {
        await db.exec("rollback");
      }
    };
    const empty = await report();
    assert.equal(empty.length, 9);
    assert.ok(empty.every((row) => row.status === "NOT DETECTED"));
    const files = [
      "001_foundation.sql",
      "002_business_onboarding.sql",
      "003_team_and_business_settings.sql",
      "004_platform_admin.sql",
      "005_authorised_sync_and_receipts.sql",
      "006_countiva_v2.sql",
      "007_subscription_management.sql",
      "008_editable_receipt_details.sql",
      "009_trial_notifications.sql",
    ];
    for (const [index, file] of files.entries()) {
      await db.exec(
        await readFile(
          new URL("../supabase/migrations/" + file, import.meta.url),
          "utf8",
        ),
      );
      const rows = await report();
      for (const row of rows.slice(0, index + 1)) {
        assert.equal(
          row.status,
          "PRESENT (structural check)",
          `${file}: ${JSON.stringify(row)}`,
        );
        assert.deepEqual(row.missing_objects, []);
      }
      assert.ok(
        rows
          .slice(index + 1)
          .every((row) => row.status !== "PRESENT (structural check)"),
        "later upgrades must not be reported installed",
      );
    }
    await db.exec(
      "drop function public.platform_subscriptions(text,text,integer,integer)",
    );
    const partial = (await report()).find((row) => row.migration === "007");
    assert.equal(partial.status, "PARTIAL - REVIEW BEFORE RUNNING SQL");
    assert.deepEqual(partial.missing_objects, [
      "function: public.platform_subscriptions(text,text,integer,integer)",
    ]);
    await db.exec(
      "alter table public.subscription_access_grants disable trigger growth_trial_notification",
    );
    const disabled = (await report()).find((row) => row.migration === "009");
    assert.equal(disabled.status, "PARTIAL - REVIEW BEFORE RUNNING SQL");
    assert.deepEqual(disabled.missing_objects, [
      "trigger: public.subscription_access_grants.growth_trial_notification",
    ]);
  } finally {
    await db.close();
  }
});
