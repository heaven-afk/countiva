import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { test } from "node:test";

test("platform subscription controls enforce roles, trial Growth limits, expiry, pauses, billing integrity and reminder eligibility", async () => {
  const db = new PGlite();
  try {
    await db.exec(
      "create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text unique,email_confirmed_at timestamptz,raw_user_meta_data jsonb default '{}'::jsonb);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema public,auth to authenticated,service_role;grant execute on function auth.uid() to authenticated;alter default privileges in schema public grant select,insert,update,delete on tables to authenticated;",
    );
    for (const file of [
      "001_foundation.sql",
      "002_business_onboarding.sql",
      "003_team_and_business_settings.sql",
      "004_platform_admin.sql",
      "005_authorised_sync_and_receipts.sql",
      "006_countiva_v2.sql",
      "007_subscription_management.sql",
    ])
      await db.exec(
        await readFile(
          new URL("../supabase/migrations/" + file, import.meta.url),
          "utf8",
        ),
      );
    const ids = {
      owner: randomUUID(),
      outsider: randomUUID(),
      platformOwner: randomUUID(),
      admin: randomUUID(),
      viewer: randomUUID(),
      staff: randomUUID(),
      unconfirmed: randomUUID(),
    };
    for (const [name, id] of Object.entries(ids))
      await db.query(
        "insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values($1,$2,$3,$4)",
        [
          id,
          name + "@admin.test",
          name === "unconfirmed" ? null : new Date().toISOString(),
          JSON.stringify({ owner_name: "Amara Test" }),
        ],
      );
    for (const [name, role] of [
      ["platformOwner", "owner"],
      ["admin", "admin"],
      ["viewer", "viewer"],
      ["unconfirmed", "admin"],
    ])
      await db.query(
        "insert into platform_admins(user_id,role) values($1,$2)",
        [ids[name], role],
      );
    const identity = async (id) => {
      await db.exec("set role authenticated");
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
        id,
      ]);
    };
    const rpc = async (name, args = []) =>
      (
        await db.query(
          "select public." +
            name +
            "(" +
            args.map((_, i) => "$" + (i + 1)).join(",") +
            ") as result",
          args,
        )
      ).rows[0].result;
    const details = (extra = {}) => ({
      reason: "Approved onboarding trial",
      requestId: randomUUID(),
      ...extra,
    });
    const future = new Date(Date.now() + 14 * 86400000).toISOString();
    await identity(ids.owner);
    const bid = await rpc("setup_business", [
      "Amara shop",
      "Retail shop",
      "",
      "",
    ]);
    await identity(ids.outsider);
    const other = await rpc("setup_business", [
      "Other shop",
      "Retail shop",
      "",
      "",
    ]);
    await assert.rejects(
      rpc("platform_subscriptions", ["", "all", 0, 25]),
      /administrator/,
    );
    await assert.rejects(
      rpc("platform_manage_subscription", [
        bid,
        "trial",
        JSON.stringify(details({ expiresAt: future })),
      ]),
      /owner or admin/,
    );
    await assert.rejects(
      rpc("business_subscription_state", [bid]),
      /permission denied/,
    );
    await identity(ids.viewer);
    assert.equal(
      (await rpc("platform_subscriptions", ["", "all", 0, 25])).total,
      2,
    );
    await assert.rejects(
      rpc("platform_manage_subscription", [
        bid,
        "pause",
        JSON.stringify(details()),
      ]),
      /owner or admin/,
    );
    await identity(ids.unconfirmed);
    await assert.rejects(
      rpc("platform_subscriptions", ["", "all", 0, 25]),
      /administrator/,
    );
    await identity(ids.admin);
    const trial = details({ expiresAt: future });
    let access = await rpc("platform_manage_subscription", [
      bid,
      "trial",
      JSON.stringify(trial),
    ]);
    assert.equal(access.status, "trial");
    assert.equal(access.source, "trial");
    assert.equal(access.tier, "growth");
    assert.equal(access.hasAccess, true);
    assert.equal(access.maxMembers, 6);
    assert.equal(access.scanLimit, 100);
    assert.equal(access.scanItems, 40);
    assert.equal(access.receiptTemplates.length, 4);
    await rpc("platform_manage_subscription", [
      bid,
      "trial",
      JSON.stringify(trial),
    ]);
    await assert.rejects(
      rpc("platform_manage_subscription", [
        bid,
        "pause",
        JSON.stringify(trial),
      ]),
      /already used/,
    );
    await assert.rejects(
      db.exec("select * from subscription_access_grants"),
      /permission denied/,
    );
    const listed = await rpc("platform_subscriptions", [
      "Amara",
      "trial",
      0,
      25,
    ]);
    assert.equal(listed.total, 1);
    assert.equal(listed.businesses[0].lastPayment, null);
    assert.equal(listed.businesses[0].ownerEmail, "owner@admin.test");
    assert.equal(
      (await rpc("platform_subscription_history", [bid])).events.length,
      1,
    );
    await db.exec("reset role");
    assert.equal(
      (await db.query("select count(*)::int n from billing_orders")).rows[0].n,
      0,
    );
    assert.equal(
      (
        await db.query(
          "select count(*)::int n from subscription_access_grants where revoked_at is null",
        )
      ).rows[0].n,
      1,
    );
    await identity(ids.owner);
    const ticket = await rpc("begin_stock_scan", [bid]);
    assert.equal(ticket.itemLimit, 40);
    const invitation = await rpc("invite_staff", [
      bid,
      "staff@admin.test",
      "staff",
    ]);
    await rpc("save_notification_preferences", [
      bid,
      JSON.stringify({
        enabled: true,
        morning: true,
        evening: false,
        morning_time: "08:00",
        evening_time: "20:00",
      }),
    ]);
    await rpc("save_push_subscription", [
      bid,
      JSON.stringify({
        endpoint: "https://fcm.googleapis.com/fcm/send/admin-test",
        p256dh: "a".repeat(87),
        auth: "a".repeat(22),
      }),
    ]);
    await db.exec("reset role");
    await db.query(
      "update notification_preferences set morning_time=date_trunc('minute',now() at time zone 'Africa/Lagos')::time where business_id=$1",
      [bid],
    );
    await db.exec("set role service_role");
    let jobs = await rpc("claim_due_reminders");
    assert.equal(jobs.length, 1);
    assert.equal(jobs[0].name, "Amara");
    await db.exec("reset role");
    await db.query("delete from notification_deliveries where business_id=$1", [
      bid,
    ]);
    await identity(ids.admin);
    access = await rpc("platform_manage_subscription", [
      bid,
      "pause",
      JSON.stringify(details({ reason: "Temporarily suspended by admin" })),
    ]);
    assert.equal(access.status, "paused");
    assert.equal(access.hasAccess, false);
    assert.equal(Date.parse(access.expiresAt), Date.parse(future));
    await identity(ids.owner);
    assert.equal((await rpc("business_entitlements", [bid])).status, "paused");
    await assert.rejects(rpc("begin_stock_scan", [bid]), /subscription/);
    await assert.rejects(
      rpc("invite_staff", [bid, "extra@admin.test", "staff"]),
      /subscription/,
    );
    await assert.rejects(
      rpc("create_billing_order", [bid, "growth-monthly"]),
      /paused/,
    );
    await assert.rejects(rpc("reserve_daily_insight", [bid]), /subscription/);
    await assert.rejects(
      rpc("sync_workspace", [
        bid,
        JSON.stringify({
          products: [
            {
              id: randomUUID(),
              name: "Rice",
              unit: "bag",
              category: "Food",
              price: 200,
              cost: 100,
              threshold: 5,
            },
          ],
          sales: [],
          movements: [],
          payments: [],
        }),
      ]),
      /subscription/,
    );
    assert.equal(
      (
        await rpc("sync_workspace", [
          bid,
          JSON.stringify({
            products: [],
            sales: [],
            movements: [],
            payments: [],
          }),
        ])
      ).products.length,
      0,
    );
    await identity(ids.staff);
    await assert.rejects(
      rpc("accept_staff_invitation", [invitation]),
      /unpaused/,
    );
    await db.exec("set role service_role");
    assert.equal((await rpc("claim_due_reminders")).length, 0);
    await identity(ids.admin);
    access = await rpc("platform_manage_subscription", [
      bid,
      "resume",
      JSON.stringify(details()),
    ]);
    assert.equal(access.status, "trial");
    await identity(ids.staff);
    assert.equal(await rpc("accept_staff_invitation", [invitation]), bid);
    await identity(ids.owner);
    for (let i = 0; i < 4; i++)
      await rpc("invite_staff", [bid, "team" + i + "@admin.test", "staff"]);
    await assert.rejects(
      rpc("invite_staff", [bid, "overflow@admin.test", "staff"]),
      /limit/,
    );
    const order = await rpc("create_billing_order", [bid, "growth-monthly"]);
    await db.exec("reset role");
    await db.query(
      "update billing_orders set checkout_id='checkout_paid' where id=$1",
      [order.id],
    );
    await db.exec("set role service_role");
    await rpc("apply_verified_billing_payment", [
      order.id,
      "checkout_paid",
      "payment_paid",
      4500000,
      "NGN",
      "event_paid",
      "checkout.completed",
    ]);
    await identity(ids.admin);
    const duringTrial = (
      await rpc("platform_subscriptions", ["Amara", "trial", 0, 25])
    ).businesses[0].access;
    assert.equal(duringTrial.nextOffer, "growth-monthly");
    assert.ok(Date.parse(duringTrial.nextStartsAt) >= Date.parse(future));
    await rpc("platform_manage_subscription", [
      bid,
      "end_grant",
      JSON.stringify(details()),
    ]);
    await identity(ids.owner);
    access = await rpc("business_entitlements", [bid]);
    assert.equal(access.hasAccess, false);
    // Simulate reaching the scheduled paid start without extending or changing its duration.
    await db.exec("reset role");
    await db.query(
      "update subscription_terms set starts_at=now()-interval '1 minute',ends_at=now()+interval '1 month' where order_id=$1",
      [order.id],
    );
    await identity(ids.owner);
    access = await rpc("business_entitlements", [bid]);
    assert.equal(access.source, "payment");
    assert.equal(access.hasAccess, true);
    assert.equal(
      (await rpc("business_billing_history", [bid]))[0].status,
      "paid",
    );
    await identity(ids.platformOwner);
    await rpc("platform_manage_subscription", [
      other,
      "activate",
      JSON.stringify(
        details({
          expiresAt: future,
          tier: "starter",
          reason: "External activation reference TEST-100",
        }),
      ),
    ]);
    await identity(ids.outsider);
    access = await rpc("business_entitlements", [other]);
    assert.equal(access.source, "manual");
    assert.equal(access.tier, "starter");
    assert.equal(access.hasAccess, true);
    assert.deepEqual(await rpc("business_billing_history", [other]), []);
    await db.exec("reset role");
    await db.query(
      "update subscription_access_grants set starts_at=now()-interval '2 days',ends_at=now()-interval '1 day' where business_id=$1",
      [other],
    );
    await identity(ids.outsider);
    assert.equal(
      (await rpc("business_entitlements", [other])).hasAccess,
      false,
    );
    await identity(ids.admin);
    await rpc("platform_manage_subscription", [
      other,
      "pause",
      JSON.stringify(details()),
    ]);
    await assert.rejects(
      rpc("platform_manage_subscription", [
        other,
        "resume",
        JSON.stringify(details()),
      ]),
      /period has ended/,
    );
    await assert.rejects(
      rpc("platform_manage_subscription", [
        other,
        "trial",
        JSON.stringify(details({ expiresAt: "2020-01-01T00:00:00Z" })),
      ]),
      /expiry/,
    );
    await assert.rejects(
      rpc("platform_manage_subscription", [
        bid,
        "activate",
        JSON.stringify(details({ expiresAt: future, tier: "starter" })),
      ]),
      /two other users/,
    );
    const history = await rpc("platform_subscription_history", [bid]);
    assert.ok(history.events.some((e) => e.action === "trial"));
    assert.ok(history.events.some((e) => e.action === "pause"));
    assert.equal(history.orders[0].status, "paid");
    assert.equal(history.orders[0].amount, 4500000);
    await identity(ids.owner);
    await assert.rejects(
      rpc("platform_subscription_history", [bid]),
      /administrator/,
    );
  } finally {
    await db.close();
  }
});
