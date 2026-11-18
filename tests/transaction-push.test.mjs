import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import { testDatabase } from "./test-database.mjs";
import { buildAnalytics } from "../src/lib/analytics.ts";
test("server validates transaction prices, preserves defaults/history, and deduplicates/rearms real push events", async () => {
  const { db, identity, rpc } = await testDatabase();
  try {
    const owner = randomUUID(),
      outsider = randomUUID(),
      pid = randomUUID();
    await db.query(
      "insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values($1,'owner@pricing.test',now(),'{\"owner_name\":\"Ada Owner\"}'),($2,'outsider@pricing.test',now(),'{}')",
      [owner, outsider],
    );
    await identity(owner);
    const bid = await rpc("setup_business", [
      "Pricing shop",
      "Retail shop",
      "",
      "",
    ]);
    await db.exec("reset role");
    await db.query(
      "insert into subscription_access_grants(business_id,kind,tier,ends_at,created_by,reason) values($1,'trial','growth',now()+interval '1 month',$2,'Transaction acceptance test')",
      [bid, owner],
    );
    await identity(owner);
    const empty = { products: [], sales: [], payments: [], movements: [] };
    const date = (n) => new Date(Date.now() + n * 86400000).toISOString();
    const due = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Africa/Lagos",
    }).format(new Date(Date.now() - 86400000));
    const product = {
      id: pid,
      name: "Phone",
      unit: "phone",
      category: "Devices",
      cost: 60000000,
      price: 70000000,
      threshold: 1,
    };
    await rpc("sync_workspace", [
      bid,
      JSON.stringify({
        ...empty,
        products: [product],
        movements: [
          {
            id: randomUUID(),
            productId: pid,
            quantity: 3,
            createdAt: date(-3),
            reason: "Opening stock",
          },
        ],
      }),
    ]);
    const sale = (paid, price = 69000000) => ({
      id: randomUUID(),
      createdAt: date(-2),
      dueDate: due,
      total: price,
      paid,
      method: "Cash",
      customer: "Test customer",
      lines: [
        {
          productId: pid,
          name: "Phone",
          unit: "phone",
          quantity: 1,
          cost: 60000000,
          price,
          originalPrice: 70000000,
        },
      ],
    });
    const a = sale(69000000),
      b = sale(60000000),
      c = sale(70000000, 70000000);
    const result = await rpc("sync_workspace", [
      bid,
      JSON.stringify({ ...empty, sales: [a, b, c] }),
    ]);
    assert.equal(result.products[0].price, 70000000);
    assert.equal(result.products[0].stock, 0);
    assert.equal(
      result.sales.find((s) => s.id === a.id).total -
        result.sales.find((s) => s.id === a.id).paid,
      0,
    );
    assert.equal(
      result.sales.find((s) => s.id === b.id).total -
        result.sales.find((s) => s.id === b.id).paid,
      9000000,
    );
    assert.equal(
      result.sales.find((s) => s.id === b.id).lines[0].originalPrice,
      70000000,
    );
    assert.equal(result.sales[0].recordedByName, "Ada Owner");
    await rpc("sync_workspace", [
      bid,
      JSON.stringify({
        ...empty,
        sales: [
          {
            ...a,
            total: 1,
            paid: 1,
            lines: [{ ...a.lines[0], price: 1, originalPrice: 1 }],
          },
        ],
      }),
    ]);
    const preserved = await rpc("sync_workspace", [bid, JSON.stringify(empty)]);
    assert.equal(preserved.sales.find((s) => s.id === a.id).total, 69000000);
    await assert.rejects(
      rpc("sync_workspace", [
        bid,
        JSON.stringify({ ...empty, sales: [{ ...sale(1), total: 2 }] }),
      ]),
      /sale total/,
    );
    await assert.rejects(
      rpc("sync_workspace", [
        bid,
        JSON.stringify({
          ...empty,
          sales: [{ ...sale(1), dueDate: "2020-01-01" }],
        }),
      ]),
      /due date/,
    );
    await rpc("save_notification_preferences", [
      bid,
      JSON.stringify({
        enabled: true,
        morning: false,
        evening: false,
        low_stock: true,
        overdue_debt: true,
        daily_report: true,
        weekly_report: true,
        monthly_report: true,
        report_time: "00:00",
      }),
    ]);
    await rpc("save_push_subscription", [
      bid,
      JSON.stringify({
        endpoint: "https://fcm.googleapis.com/test",
        p256dh: "A".repeat(87),
        auth: "B".repeat(22),
      }),
    ]);
    await db.exec("reset role;set role service_role");
    const events = await rpc("claim_business_push_events");
    assert.equal(events.filter((e) => e.kind === "low_stock").length, 1);
    assert.equal(events.filter((e) => e.kind === "overdue_debt").length, 1);
    assert.match(
      events.find((e) => e.kind === "overdue_debt").body,
      /90000\.00/,
    );
    assert.ok(events.every((e) => e.url.includes(`business=${bid}`)));
    for (const event of events)
      await db.query(
        "update business_push_deliveries set status='sent' where event_id=$1 and user_id=$2",
        [event.id, owner],
      );
    assert.deepEqual(await rpc("claim_business_push_events"), []);
    await identity(owner);
    await rpc("sync_workspace", [
      bid,
      JSON.stringify({
        ...empty,
        movements: [
          {
            id: randomUUID(),
            productId: pid,
            quantity: 3,
            createdAt: date(0),
            reason: "Restock",
          },
        ],
        sales: [sale(69000000), sale(69000000)],
      }),
    ]);
    await db.exec("reset role;set role service_role");
    assert.equal(
      (await rpc("claim_business_push_events")).filter(
        (e) => e.kind === "low_stock",
      ).length,
      1,
    );
    const reportJobs = [
      ...(await rpc("claim_scheduled_reports")),
      ...(await rpc("claim_scheduled_reports")),
    ];
    assert.equal(reportJobs.length, 3);
    assert.deepEqual(reportJobs.map((j) => j.kind).sort(), [
      "daily_report",
      "monthly_report",
      "weekly_report",
    ]);
    const job = reportJobs[0],
      snapshot = await rpc("scheduled_report_snapshot", [job.id]);
    assert.equal(snapshot.sales.length, 5);
    const report = {
      days: job.days,
      periodStart: `${job.startDate}T00:00:00+01:00`,
      periodEnd: `${job.endDate}T23:59:59.999+01:00`,
      asOf: new Date().toISOString(),
      metrics: { revenue: 123 },
    };
    await assert.rejects(
      rpc("complete_scheduled_report", [
        job.id,
        JSON.stringify({ ...report, days: 99 }),
      ]),
      /period mismatch/,
    );
    await rpc("complete_scheduled_report", [job.id, JSON.stringify(report)]);
    for (const remaining of reportJobs.slice(1)) {
      const records = await rpc("scheduled_report_snapshot", [remaining.id]);
      const analysis = buildAnalytics(
        records,
        remaining.days,
        new Date(),
        `${remaining.endDate}T12:00:00+01:00`,
      );
      await rpc("complete_scheduled_report", [
        remaining.id,
        JSON.stringify(analysis),
      ]);
    }
    const ready = await rpc("claim_business_push_events");
    assert.equal(ready.filter((e) => e.kind.endsWith("_report")).length, 3);
    assert.ok(
      ready
        .filter((e) => e.kind.endsWith("_report"))
        .every((e) => e.url.includes("&report=")),
    );
    assert.deepEqual(await rpc("claim_scheduled_reports"), []);
    await identity(owner);
    assert.equal(
      (await rpc("get_business_report", [bid, job.id])).metrics.revenue,
      123,
    );
    assert.ok(
      (await rpc("list_business_reports", [bid])).some((r) => r.id === job.id),
    );
    const preferences = await rpc("get_notification_preferences", [bid]);
    assert.equal(preferences.daily_report, true);
    await rpc("save_notification_preferences", [
      bid,
      JSON.stringify({ ...preferences, daily_report: false }),
    ]);
    await identity(outsider);
    await assert.rejects(
      rpc("get_business_report", [bid, job.id]),
      /access denied/,
    );
    await assert.rejects(
      rpc("claim_business_push_events"),
      /permission denied/,
    );
    await assert.rejects(
      db.query("select * from push_subscriptions"),
      /permission denied/,
    );
  } finally {
    await db.close();
  }
});
