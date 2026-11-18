import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { testDatabase } from "./test-database.mjs";
test("30-day trial upgrade preserves existing 45-day grants", async () => {
  const { db, identity, rpc } = await testDatabase(16);
  try {
    const owners = [randomUUID(), randomUUID()];
    for (const id of owners)
      await db.query(
        "insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())",
        [id, `${id}@trial.test`],
      );
    await identity(owners[0]);
    const first = await rpc("setup_business", [
      "Existing shop",
      "Retail shop",
      "",
      "",
    ]);
    const original = await rpc("business_entitlements", [first]);
    assert.ok(
      Math.abs((Date.parse(original.expiresAt) - Date.now()) / 86400000 - 45) <
        0.01,
    );
    await db.exec("reset role");
    const before = (
      await db.query("select revision from platform_trial_settings")
    ).rows[0].revision;
    await db.exec(
      await readFile(
        new URL(
          "../supabase/migrations/017_thirty_day_trials.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    const policy = (
      await db.query("select days,revision from platform_trial_settings")
    ).rows[0];
    assert.equal(policy.days, 30);
    assert.equal(policy.revision, before + 1);
    await identity(owners[0]);
    assert.equal(
      (await rpc("business_entitlements", [first])).expiresAt,
      original.expiresAt,
    );
    await identity(owners[1]);
    const second = await rpc("setup_business", [
      "New shop",
      "Retail shop",
      "",
      "",
    ]);
    const current = await rpc("business_entitlements", [second]);
    assert.ok(
      Math.abs((Date.parse(current.expiresAt) - Date.now()) / 86400000 - 30) <
        0.01,
    );
  } finally {
    await db.close();
  }
});
test("new owners receive one 30-day Growth trial and admins inspect and configure with their own audited identity", async () => {
  const { db, identity, rpc } = await testDatabase();
  try {
    const owner = randomUUID(),
      admin = randomUUID(),
      viewer = randomUUID(),
      second = randomUUID(),
      staff = randomUUID();
    for (const [id, email] of [
      [owner, "owner@operations.test"],
      [admin, "admin@operations.test"],
      [viewer, "viewer@operations.test"],
      [second, "second@operations.test"],
      [staff, "staff@operations.test"],
    ])
      await db.query(
        "insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())",
        [id, email],
      );
    await db.query(
      "insert into platform_admins(user_id,role) values($1,'owner'),($2,'viewer')",
      [admin, viewer],
    );
    await identity(owner);
    const bid = await rpc("setup_business", [
      "Operations shop",
      "Retail shop",
      "",
      "",
    ]);
    const entitlement = await rpc("business_entitlements", [bid]);
    assert.equal(entitlement.status, "trial");
    assert.equal(entitlement.tier, "growth");
    assert.equal(entitlement.maxMembers, 6);
    assert.ok(
      Math.abs(
        (Date.parse(entitlement.expiresAt) - Date.now()) / 86400000 - 30,
      ) < 0.01,
    );
    assert.equal(
      (await rpc("list_business_notifications", [bid])).unreadCount,
      1,
    );
    const pid = randomUUID();
    await rpc("sync_workspace", [
      bid,
      JSON.stringify({
        products: [
          {
            id: pid,
            name: "Rice",
            unit: "bag",
            category: "Food",
            price: 300000,
            cost: 200000,
            threshold: 1,
          },
        ],
        movements: [
          {
            id: randomUUID(),
            productId: pid,
            quantity: 10,
            reason: "Opening stock",
            createdAt: new Date().toISOString(),
          },
        ],
        sales: [],
        payments: [],
      }),
    ]);
    const order = await rpc("create_plan_order", [
      bid,
      "starter-monthly",
      3000000,
    ]);
    assert.equal(order.amount, 3000000);
    await assert.rejects(rpc("platform_plan_settings"), /administrator/);
    await identity(admin);
    const before = (await db.query("select auth.uid() id")).rows[0].id;
    const inspect = await rpc("platform_business_workspace", [
      bid,
      "Investigate customer stock support request",
    ]);
    assert.equal(inspect.snapshot.products[0].stock, 10);
    assert.equal(inspect.workspace.id, bid);
    assert.equal((await db.query("select auth.uid() id")).rows[0].id, before);
    await assert.rejects(
      rpc("sync_workspace", [
        bid,
        JSON.stringify({
          products: [],
          movements: [],
          sales: [],
          payments: [],
        }),
      ]),
      /access denied/,
    );
    assert.equal(
      (await rpc("platform_support_history"))[0].actor_email,
      "admin@operations.test",
    );
    const found = await rpc("platform_business_search", ["operations", 0]);
    assert.equal(found[0].id, bid);
    let settings = await rpc("platform_plan_settings");
    assert.equal(settings.trial.days, 30);
    assert.deepEqual(
      settings.plans.map((p) => [p.code, p.amount]).sort(),
      [
        ["starter-monthly", 3000000],
        ["growth-monthly", 5000000],
        ["growth-quarter", 13500000],
        ["growth-halfyear", 24000000],
        ["growth-year", 42000000],
      ].sort(),
    );
    const plan = settings.plans.find((p) => p.code === "starter-monthly");
    settings = await rpc("platform_update_plan", [
      "starter-monthly",
      3500000,
      true,
      plan.revision,
      "Adjust new checkout rate",
    ]);
    assert.equal(
      settings.plans.find((p) => p.code === "starter-monthly").amount,
      3500000,
    );
    assert.equal(settings.audit[0].actor_email, "admin@operations.test");
    await assert.rejects(
      rpc("platform_update_plan", [
        "starter-monthly",
        3600000,
        true,
        plan.revision,
        "A stale browser edit",
      ]),
      /Reload/,
    );
    await rpc("platform_update_trial", [
      14,
      true,
      settings.trial.revision,
      "New-owner trial campaign adjustment",
    ]);
    await assert.rejects(rpc("platform_server_health"), /permission denied/);
    await rpc("reserve_platform_ai_check");
    await assert.rejects(rpc("reserve_platform_ai_check"), /30 seconds/);
    await identity(owner);
    await assert.rejects(
      rpc("create_plan_order", [bid, "starter-monthly", 3000000]),
      /price has changed/,
    );
    await assert.rejects(
      rpc("create_plan_order", [bid, "starter-monthly", 3500000]),
      /earlier checkout/,
    );
    assert.equal(
      (await rpc("business_billing_history", [bid]))[0].amount,
      3000000,
    );
    assert.ok(
      Math.abs(
        (Date.parse((await rpc("business_entitlements", [bid])).expiresAt) -
          Date.now()) /
          86400000 -
          30,
      ) < 0.01,
    );
    await identity(viewer);
    await assert.rejects(
      rpc("platform_business_workspace", [bid, "Inspect another business"]),
      /owner or administrator/,
    );
    await assert.rejects(
      rpc("platform_update_trial", [20, true, 1, "Not authorised change"]),
      /owner or administrator/,
    );
    await assert.rejects(
      db.query("select * from platform_support_access"),
      /permission denied/,
    );
    await identity(second);
    const otherBid = await rpc("setup_business", [
      "Second shop",
      "Retail shop",
      "",
      "",
    ]);
    assert.ok(
      Math.abs(
        (Date.parse(
          (await rpc("business_entitlements", [otherBid])).expiresAt,
        ) -
          Date.now()) /
          86400000 -
          14,
      ) < 0.01,
    );
    await db.exec("reset role");
    await db.query("insert into memberships values($1,$2,'staff')", [
      bid,
      staff,
    ]);
    assert.equal(
      (await db.query("select count(*)::int n from new_owner_trial_claims"))
        .rows[0].n,
      2,
    );
    await db.exec("set role anon");
    assert.equal((await rpc("public_trial_offer")).days, 14);
    assert.ok((await rpc("public_plan_catalog")).length === 5);
    await assert.rejects(rpc("platform_plan_settings"), /permission denied/);
  } finally {
    await db.close();
  }
});

test("traffic counts page views and sessions privately, deduplicates events and rate limits writes", async () => {
  const { db, identity, rpc } = await testDatabase();
  try {
    const admin = randomUUID(),
      outsider = randomUUID();
    for (const [id, email] of [
      [admin, "admin@traffic.test"],
      [outsider, "other@traffic.test"],
    ])
      await db.query(
        "insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())",
        [id, email],
      );
    await db.query(
      "insert into platform_admins(user_id,role) values($1,'owner')",
      [admin],
    );
    await db.exec("set role service_role");
    const event = randomUUID(),
      session = randomUUID();
    for (const [id, sid, path] of [
      [event, session, "/"],
      [event, session, "/"],
      [randomUUID(), session, "/plans"],
      [randomUUID(), randomUUID(), "/signup"],
    ])
      await rpc("record_website_visit", [
        id,
        sid,
        path,
        "google.com",
        "a".repeat(64),
      ]);
    await identity(admin);
    const traffic = await rpc("platform_traffic_summary", [7]);
    assert.equal(traffic.pageViews, 3);
    assert.equal(traffic.sessions, 2);
    assert.equal(traffic.daily.length, 7);
    assert.equal(traffic.sources[0].source, "google.com");
    await identity(outsider);
    await assert.rejects(
      rpc("platform_traffic_summary", [30]),
      /administrator/,
    );
    await assert.rejects(
      db.query("select * from website_visits"),
      /permission denied/,
    );
    await db.exec("set role service_role");
    for (let n = 0; n < 120; n++)
      assert.equal(
        await rpc("record_website_visit", [
          randomUUID(),
          session,
          "/",
          "",
          "b".repeat(64),
        ]),
        true,
      );
    assert.equal(
      await rpc("record_website_visit", [
        randomUUID(),
        session,
        "/",
        "",
        "b".repeat(64),
      ]),
      false,
    );
    await assert.rejects(
      rpc("record_website_visit", [
        randomUUID(),
        session,
        "/workspace",
        "",
        "c".repeat(64),
      ]),
      /check constraint/,
    );
    await db.exec("set role anon");
    await assert.rejects(
      rpc("record_website_visit", [
        randomUUID(),
        session,
        "/",
        "",
        "d".repeat(64),
      ]),
      /permission denied/,
    );
  } finally {
    await db.close();
  }
});
