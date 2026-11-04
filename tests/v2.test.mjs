import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { test } from "node:test";
test("V2 subscriptions enforce paid access, roles, team seats, receipts, scan quotas and paid reports", async () => {
  const db = new PGlite();
  try {
    await db.exec(
      `create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text unique,email_confirmed_at timestamptz,raw_user_meta_data jsonb default '{}'::jsonb);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema public,auth to authenticated,service_role;grant execute on function auth.uid() to authenticated;alter default privileges in schema public grant select,insert,update,delete on tables to authenticated;`,
    );
    for (const file of [
      "001_foundation.sql",
      "002_business_onboarding.sql",
      "003_team_and_business_settings.sql",
      "004_platform_admin.sql",
      "005_authorised_sync_and_receipts.sql",
      "006_countiva_v2.sql",
    ])
      await db.exec(
        await readFile(
          new URL("../supabase/migrations/" + file, import.meta.url),
          "utf8",
        ),
      );
    const owner = randomUUID(),
      outsider = randomUUID();
    for (const [id, email] of [
      [owner, "owner@v2.test"],
      [outsider, "outsider@v2.test"],
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
    const rpc = async (name, args = []) =>
      (
        await db.query(
          `select public.${name}(${args.map((_, i) => "$" + (i + 1)).join(",")}) as result`,
          args,
        )
      ).rows[0].result;
    await identity(owner);
    const bid = await rpc("setup_business", ["V2 shop", "Retail shop", "", ""]);
    assert.equal((await rpc("business_entitlements", [bid])).hasAccess, false);
    await assert.rejects(rpc("begin_stock_scan", [bid]), /subscription/i);
    await assert.rejects(
      rpc("sync_workspace", [
        bid,
        JSON.stringify({
          products: [
            {
              id: randomUUID(),
              name: "Rice",
              unit: "bag",
              cost: 100,
              price: 200,
              stock: 1,
              threshold: 5,
              category: "Food",
            },
          ],
          sales: [],
          movements: [],
          payments: [],
        }),
      ]),
      /subscription/i,
    );
    const empty = await rpc("sync_workspace", [
      bid,
      JSON.stringify({ products: [], sales: [], movements: [], payments: [] }),
    ]);
    assert.equal(empty.products.length, 0);
    const order = await rpc("create_billing_order", [bid, "starter-monthly"]);
    assert.equal(order.amount, 2500000);
    assert.equal(
      (await rpc("create_billing_order", [bid, "starter-monthly"])).id,
      order.id,
    );
    await assert.rejects(
      rpc("create_billing_order", [bid, "growth-monthly"]),
      /pending/i,
    );
    await assert.rejects(
      db.query("update public.billing_orders set status='paid' where id=$1", [
        order.id,
      ]),
      /permission denied/i,
    );
    await assert.rejects(
      rpc("apply_verified_billing_payment", [
        order.id,
        "chk_one",
        "pay_one",
        2500000,
        "NGN",
        "evt_one",
        "checkout.completed",
      ]),
      /permission denied/i,
    );
    const pay = async (order, checkout, payment) => {
      await db.exec("reset role");
      await db.query("update billing_orders set checkout_id=$1 where id=$2", [
        checkout,
        order.id,
      ]);
      await db.exec("set role service_role");
      return rpc("apply_verified_billing_payment", [
        order.id,
        checkout,
        payment,
        order.amount,
        "NGN",
        "evt_" + payment,
        "checkout.completed",
      ]);
    };
    assert.equal(await pay(order, "chk_one", "pay_one"), true);
    assert.equal(await pay(order, "chk_one", "pay_one"), false);
    await identity(owner);
    let access = await rpc("business_entitlements", [bid]);
    assert.equal(access.tier, "starter");
    assert.equal(access.maxMembers, 3);
    assert.equal(access.scanItems, 10);
    assert.equal(access.scanLimit, 20);
    assert.equal(access.receiptTemplates.length, 2);
    await rpc("invite_staff", [bid, "one@v2.test", "staff"]);
    await rpc("invite_staff", [bid, "two@v2.test", "manager"]);
    await assert.rejects(
      rpc("invite_staff", [bid, "three@v2.test", "staff"]),
      /limit/i,
    );
    await assert.rejects(
      rpc("update_business_settings", [
        bid,
        JSON.stringify({
          name: "V2 shop",
          business_type: "Retail shop",
          phone: "",
          address: "",
          receipt_footer: "Thanks",
          receipt_width: 80,
          logo_url: "",
          receipt_template: "bold",
        }),
      ]),
      /template|Growth/i,
    );
    const ticket = await rpc("begin_stock_scan", [bid]);
    assert.equal(ticket.itemLimit, 10);
    await assert.rejects(
      rpc("finish_stock_scan", [ticket.id, true]),
      /permission denied/,
    );
    await db.exec("set role service_role");
    await rpc("finish_stock_scan", [ticket.id, true]);
    await identity(owner);
    const rows = [
      { name: "Rice", unit: "bag", cost: 10000, price: 15000, quantity: 2 },
      { name: "Beans", unit: "bag", cost: 12000, price: 16000, quantity: 3 },
    ];
    assert.equal(
      await rpc("apply_stock_scan", [bid, ticket.id, JSON.stringify(rows)]),
      true,
    );
    assert.equal(
      await rpc("apply_stock_scan", [bid, ticket.id, JSON.stringify(rows)]),
      false,
    );
    const snapshot = await rpc("sync_workspace", [
      bid,
      JSON.stringify({ products: [], sales: [], movements: [], payments: [] }),
    ]);
    assert.equal(snapshot.products.length, 2);
    assert.deepEqual(snapshot.products.map((p) => p.stock).sort(), [2, 3]);
    const badTicket = await rpc("begin_stock_scan", [bid]);
    await db.exec("set role service_role");
    await rpc("finish_stock_scan", [badTicket.id, true]);
    await identity(owner);
    await assert.rejects(
      rpc("apply_stock_scan", [
        bid,
        badTicket.id,
        JSON.stringify([rows[0], { name: "Missing fields", quantity: 1 }]),
      ]),
      /name|unit|cost/i,
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
      2,
    );
    for (let i = 0; i < 18; i++) await rpc("begin_stock_scan", [bid]);
    await assert.rejects(rpc("begin_stock_scan", [bid]), /allowance|limit/i);
    await assert.rejects(
      rpc("finish_stock_scan", [badTicket.id, false]),
      /permission denied/,
    ); // ready scans cannot be refunded by a browser
    await assert.rejects(rpc("begin_stock_scan", [bid]), /allowance|limit/i);
    const growth = await rpc("create_billing_order", [bid, "growth-quarter"]);
    assert.equal(growth.amount, 6000000);
    await pay(growth, "chk_two", "pay_two");
    await identity(owner);
    access = await rpc("business_entitlements", [bid]);
    assert.equal(access.tier, "starter");
    assert.equal(access.nextOffer, "growth-quarter");
    // Move the paid Starter term into the past and start the next paid term now.
    await db.exec("reset role");
    await db.query(
      "update subscription_terms set starts_at=now()-interval '2 months',ends_at=now()-interval '1 month' where order_id=$1",
      [order.id],
    );
    await db.query(
      "update subscription_terms set starts_at=now()-interval '1 minute',ends_at=now()+interval '3 months' where order_id=$1",
      [growth.id],
    );
    await identity(owner);
    access = await rpc("business_entitlements", [bid]);
    assert.equal(access.tier, "growth");
    assert.equal(access.scanItems, 40);
    assert.equal(access.maxMembers, 6);
    await rpc("invite_staff", [bid, "three@v2.test", "staff"]);
    await rpc("invite_staff", [bid, "four@v2.test", "staff"]);
    await rpc("invite_staff", [bid, "five@v2.test", "staff"]);
    await assert.rejects(
      rpc("invite_staff", [bid, "six@v2.test", "staff"]),
      /limit/i,
    );
    await assert.rejects(
      rpc("create_billing_order", [bid, "starter-monthly"]),
      /two other users/i,
    );
    await rpc("update_business_settings", [
      bid,
      JSON.stringify({
        name: "V2 shop",
        business_type: "Retail shop",
        phone: "",
        address: "",
        receipt_footer: "Thanks",
        receipt_width: 80,
        logo_url: "",
        receipt_template: "bold",
      }),
    ]);
    await assert.rejects(
      rpc("reserve_business_report", [bid, randomUUID()]),
      /report|purchase/i,
    );
    const reportOrder = await rpc("create_billing_order", [
      bid,
      "analytics-report",
    ]);
    assert.equal(reportOrder.amount, 500000);
    await pay(reportOrder, "chk_report", "pay_report");
    await identity(owner);
    const reports = await rpc("list_business_reports", [bid]);
    assert.equal(reports.length, 1);
    const reserved = await rpc("reserve_business_report", [bid, reports[0].id]);
    assert.ok(reserved.snapshot);
    await db.exec("set role service_role");
    await rpc("complete_business_report", [
      bid,
      reports[0].id,
      JSON.stringify({ metrics: { revenue: 0 }, days: 30 }),
    ]);
    await identity(owner);
    assert.equal(
      (await rpc("get_business_report", [bid, reports[0].id])).days,
      30,
    );
    await rpc("save_notification_preferences", [
      bid,
      JSON.stringify({
        enabled: true,
        morning: true,
        evening: true,
        morning_time: "08:00",
        evening_time: "20:00",
      }),
    ]);
    await assert.rejects(
      rpc("save_push_subscription", [
        bid,
        JSON.stringify({
          endpoint: "https://localhost/private",
          p256dh: "a".repeat(87),
          auth: "a".repeat(22),
        }),
      ]),
      /endpoint|subscription|push/i,
    );
    await rpc("save_push_subscription", [
      bid,
      JSON.stringify({
        endpoint: "https://fcm.googleapis.com/fcm/send/test",
        p256dh: "a".repeat(87),
        auth: "a".repeat(22),
      }),
    ]);
    await db.exec("reset role");
    await db.query(
      "update notification_preferences set morning_time=date_trunc('minute',now() at time zone 'Africa/Lagos')::time,evening=false where business_id=$1",
      [bid],
    );
    await db.exec("set role service_role");
    const due = await rpc("claim_due_reminders");
    assert.equal(due.length, 1);
    assert.equal(due[0].kind, "morning");
    assert.equal((await rpc("claim_due_reminders")).length, 0);
    await db.query(
      "update notification_deliveries set status='sent' where id=$1",
      [due[0].id],
    );
    assert.equal((await rpc("claim_due_reminders")).length, 0);
    await identity(owner);
    await rpc("save_notification_preferences", [
      bid,
      JSON.stringify({
        enabled: false,
        morning: true,
        evening: true,
        morning_time: "08:00",
        evening_time: "20:00",
      }),
    ]);
    await db.exec("reset role");
    assert.equal(
      (await db.query("select count(*)::int as n from push_subscriptions"))
        .rows[0].n,
      0,
    );
    await identity(outsider);
    await assert.rejects(rpc("business_entitlements", [bid]), /access denied/i);
    await assert.rejects(
      rpc("get_notification_preferences", [bid]),
      /access denied/i,
    );
    await assert.rejects(
      rpc("get_business_report", [bid, reports[0].id]),
      /access denied/i,
    );
    await db.exec("set role service_role");
    await rpc("reverse_billing_payment", [
      "pay_report",
      "evt_refund",
      "refund.paid",
    ]);
    await identity(owner);
    await assert.rejects(
      rpc("get_business_report", [bid, reports[0].id]),
      /report|payment/i,
    );
  } finally {
    await db.close();
  }
});
