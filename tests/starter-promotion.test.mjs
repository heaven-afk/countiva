import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { testDatabase } from "./test-database.mjs";
test("Starter deal discounts both payment channels, keeps standard pricing editable, and automatically ends after its window", async () => {
  const { db, identity, rpc } = await testDatabase();
  try {
    const owner = randomUUID(),
      admin = randomUUID();
    for (const id of [owner, admin])
      await db.query(
        "insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())",
        [id, `${id}@promotion.test`],
      );
    await db.query(
      "insert into platform_admins(user_id,role) values($1,'admin')",
      [admin],
    );
    await identity(owner);
    const bid = await rpc("setup_business", [
      "Deal shop",
      "Retail shop",
      "",
      "",
    ]);
    const catalog = await rpc("public_plan_catalog");
    const starter = catalog.find((p) => p.code === "starter-monthly");
    assert.equal(starter.amount, 200000);
    assert.equal(starter.baseAmount, 500000);
    assert.equal(starter.promotionLabel, "Hot Deal");
    assert.equal(
      catalog.find((p) => p.code === "starter-year").amount,
      5000000,
    );
    const quote = await rpc("create_manual_payment", [
      bid,
      "starter-monthly",
      200000,
    ]);
    assert.equal(quote.amount, 200000);
    assert.ok(quote.promotion_ends_at);
    await rpc("submit_manual_payment", [quote.id, "Sender name", "HOTBANK001"]);
    await identity(admin);
    await assert.rejects(
      rpc("review_manual_payment", [
        quote.id,
        "approve",
        200000,
        "HOTBANK001",
        "Actual credit checked",
        true,
      ]),
      /actual bank credit date/,
    );
    await assert.rejects(
      rpc("review_manual_payment", [
        quote.id,
        "approve",
        200000,
        "HOTBANK001",
        "Actual credit checked",
        true,
        starter.promotionEndsAt,
      ]),
      /offer window/,
    );
    const credit = (await db.query("select now() as time")).rows[0].time;
    await rpc("review_manual_payment", [
      quote.id,
      "approve",
      200000,
      "HOTBANK001",
      "Actual credit checked",
      true,
      credit,
    ]);
    const settings = await rpc("platform_plan_settings");
    assert.equal(
      settings.plans.find((p) => p.code === "starter-monthly").amount,
      500000,
    );
    await identity(owner);
    assert.equal(
      (await rpc("create_plan_order", [bid, "starter-monthly", 200000])).amount,
      200000,
    );
    await db.exec("reset role");
    assert.equal(
      (
        await db.query(
          "select amount from billing_catalog where code='starter-monthly'",
        )
      ).rows[0].amount,
      500000,
    );
    await db.exec(
      "update billing_promotions set starts_at=now()-interval '8 days',ends_at=now()-interval '1 day';update billing_orders set status='expired' where status='pending'",
    );
    await identity(owner);
    const after = (await rpc("public_plan_catalog")).find(
      (p) => p.code === "starter-monthly",
    );
    assert.equal(after.amount, 500000);
    assert.equal(after.promotionEndsAt, null);
    await assert.rejects(
      rpc("create_plan_order", [bid, "starter-monthly", 200000]),
      /price has changed/,
    );
    await assert.rejects(
      rpc("create_manual_payment", [bid, "starter-monthly", 200000]),
      /price has changed/,
    );
    assert.equal(
      (await rpc("create_billing_order", [bid, "starter-monthly"])).amount,
      500000,
    );
    const history = await rpc("business_billing_history", [bid]);
    assert.ok(
      history.some((o) => o.status === "paid" && o.amount === 200000),
      "the paid promo purchase retains its price",
    );
  } finally {
    await db.close();
  }
});
