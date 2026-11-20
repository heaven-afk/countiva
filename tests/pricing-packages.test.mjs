import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { testDatabase } from "./test-database.mjs";

test("package migration preserves existing trials and checkout amounts, and enforces new seats and insight depth", async () => {
  const { db, identity, rpc } = await testDatabase(17);
  try {
    const owner = randomUUID(),
      admin = randomUUID(),
      second = randomUUID();
    for (const id of [owner, admin, second])
      await db.query(
        "insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())",
        [id, `${id}@packages.test`],
      );
    await db.query(
      "insert into platform_admins(user_id,role) values($1,'owner')",
      [admin],
    );
    await identity(owner);
    const existing = await rpc("setup_business", [
      "Existing shop",
      "Retail shop",
      "",
      "",
    ]);
    const before = await rpc("business_entitlements", [existing]);
    const pending = await rpc("create_plan_order", [
      existing,
      "starter-monthly",
      3000000,
    ]);
    await db.exec("reset role");
    for (const file of [
      "018_three_package_pricing.sql",
      "019_analytics_packages.sql",
    ])
      await db.exec(
        await readFile(
          new URL("../supabase/migrations/" + file, import.meta.url),
          "utf8",
        ),
      );
    await identity(owner);
    const after = await rpc("business_entitlements", [existing]);
    assert.equal(after.expiresAt, before.expiresAt);
    // The pending legacy Starter order reserves its original three places.
    assert.equal(after.maxMembers, 3);
    assert.equal(after.scanLimit, 100);
    assert.equal(after.analyticsLevel, "business");
    await db.exec("reset role");
    const oldOrder = (
      await db.query(
        "select amount,capacity_snapshot from billing_orders where id=$1",
        [pending.id],
      )
    ).rows[0];
    assert.equal(Number(oldOrder.amount), 3000000);
    assert.equal(oldOrder.capacity_snapshot.members, 3);
    await identity(second);
    const bid = await rpc("setup_business", [
      "New shop",
      "Retail shop",
      "",
      "",
    ]);
    let access = await rpc("business_entitlements", [bid]);
    assert.equal(access.maxMembers, 3);
    assert.equal(access.scanLimit, 30);
    assert.equal(access.analyticsLevel, "growth");
    const plans = await rpc("public_plan_catalog");
    assert.deepEqual(
      plans
        .filter((p) => p.enabled)
        .map((p) => [p.code, p.amount])
        .sort(),
      [
        ["starter-monthly", 500000],
        ["starter-year", 5000000],
        ["growth-monthly", 1500000],
        ["growth-year", 15000000],
        ["business-monthly", 3000000],
        ["business-year", 30000000],
      ].sort(),
    );
    await assert.rejects(
      rpc("create_plan_order", [bid, "growth-quarter", 13500000]),
      /unavailable/,
    );
    const activate = async (tier) => {
      await identity(admin);
      await rpc("platform_manage_subscription", [
        bid,
        "activate",
        {
          tier,
          requestId: randomUUID(),
          reason: "Check package access boundaries",
          expiresAt: new Date(Date.now() + 86400000 * 10).toISOString(),
        },
      ]);
      await identity(second);
      return rpc("business_entitlements", [bid]);
    };
    access = await activate("starter");
    assert.equal(access.maxMembers, 1);
    assert.equal(access.scanLimit, 10);
    assert.equal(access.analyticsLevel, "none");
    await assert.rejects(
      rpc("invite_staff", [bid, "staff@packages.test", "staff"]),
      /limit/,
    );
    for (const [name, args] of [
      ["reserve_included_report", [bid, 30]],
      ["reserve_daily_insight", [bid]],
      ["list_business_reports", [bid]],
      ["get_business_report", [bid, randomUUID()]],
    ])
      await assert.rejects(rpc(name, args), /Growth and Business/);
    access = await activate("growth");
    assert.equal(access.maxMembers, 3);
    assert.equal(access.scanItems, 20);
    await assert.rejects(
      rpc("reserve_included_report", [bid, 90]),
      /Business plan/,
    );
    const reserved = await rpc("reserve_included_report", [bid, 30]);
    assert.equal(reserved.analyticsLevel, "growth");
    await db.exec("set role service_role");
    await rpc("complete_business_report", [
      bid,
      reserved.reportId,
      {
        days: 30,
        metrics: { revenue: 100 },
        products: [{ name: "Private breakdown" }],
        creditAge: [{ amount: 10 }],
        paymentMix: [{ amount: 20 }],
        intelligence: { actionPlan: [{ title: "Full breakdown" }] },
        insights: [],
        daily: [],
      },
    ]);
    await identity(second);
    const limited = await rpc("get_business_report", [bid, reserved.reportId]);
    assert.deepEqual(limited.products, []);
    assert.equal(limited.intelligence, undefined);
    const cached = await rpc("reserve_included_report", [bid, 30]);
    assert.deepEqual(cached.report.creditAge, []);
    await rpc("invite_staff", [bid, "one@packages.test", "staff"]);
    await rpc("invite_staff", [bid, "two@packages.test", "staff"]);
    await assert.rejects(
      rpc("invite_staff", [bid, "three@packages.test", "staff"]),
      /limit/,
    );
    await assert.rejects(
      rpc("create_plan_order", [bid, "starter-monthly", 500000]),
      /cannot fit/,
    );
    access = await activate("business");
    assert.equal(access.maxMembers, 6);
    assert.equal(access.scanLimit, 100);
    assert.equal(access.scanItems, 40);
    assert.equal(access.analyticsLevel, "business");
    const full = await rpc("get_business_report", [bid, reserved.reportId]);
    assert.equal(full.products[0].name, "Private breakdown");
    assert.ok(full.intelligence);
    assert.equal(
      (await rpc("reserve_included_report", [bid, 90])).analyticsLevel,
      "business",
    );
    const newOrder = await rpc("create_plan_order", [
      bid,
      "business-year",
      30000000,
    ]);
    assert.equal(newOrder.capacity_snapshot.members, 6);
    await db.exec("reset role");
    await db.query(
      "update billing_orders set checkout_id='business-checkout' where id=$1",
      [newOrder.id],
    );
    await db.exec("set role service_role");
    await rpc("apply_verified_billing_payment", [
      newOrder.id,
      "business-checkout",
      "business-payment",
      30000000,
      "NGN",
      "business-event",
      "payment.completed",
    ]);
    await db.exec("reset role");
    const term = (
      await db.query(
        "select tier,capacity_snapshot from subscription_terms where order_id=$1",
        [newOrder.id],
      )
    ).rows[0];
    assert.equal(term.tier, "business");
    assert.equal(term.capacity_snapshot.members, 6);
    await identity(owner);
    await assert.rejects(
      rpc("get_business_report", [bid, reserved.reportId]),
      /access denied/,
    );
  } finally {
    await db.close();
  }
});
