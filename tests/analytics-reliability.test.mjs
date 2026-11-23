import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { testDatabase } from "./test-database.mjs";
import { buildAnalytics } from "../src/lib/analytics.ts";
import { emptyState } from "../src/lib/domain.ts";
test("daily briefs and report explanations upgrade immediately without changing a saved financial snapshot", async () => {
  const { db, identity, rpc } = await testDatabase();
  try {
    const owner = randomUUID(),
      admin = randomUUID();
    for (const id of [owner, admin])
      await db.query(
        "insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())",
        [id, `${id}@reliability.test`],
      );
    await db.query(
      "insert into platform_admins(user_id,role) values($1,'owner')",
      [admin],
    );
    await identity(owner);
    const bid = await rpc("setup_business", [
      "Reports shop",
      "Retail shop",
      "",
      "",
    ]);
    assert.equal((await rpc("reserve_daily_insight", [bid])).cached, false);
    await db.exec("set role service_role");
    const brief = {
      summary: "Growth summary",
      observations: ["a", "b"],
      actions: ["a", "b"],
    };
    await rpc("complete_daily_insight", [
      bid,
      { brief, analysisLevel: "growth", asOf: new Date().toISOString() },
    ]);
    await identity(owner);
    assert.equal((await rpc("reserve_daily_insight", [bid])).cached, true);
    const reserved = await rpc("reserve_included_report", [bid, 30]);
    const report = {
      ...buildAnalytics(emptyState),
      analysisLevel: "growth",
      aiAvailable: true,
      aiSummary: brief,
    };
    await db.exec("set role service_role");
    await rpc("complete_business_report", [bid, reserved.reportId, report]);
    await identity(admin);
    await rpc("platform_manage_subscription", [
      bid,
      "activate",
      {
        tier: "business",
        requestId: randomUUID(),
        reason: "Upgrade report depth",
        expiresAt: new Date(Date.now() + 864000000).toISOString(),
      },
    ]);
    await identity(owner);
    const deeperBrief = await rpc("reserve_daily_insight", [bid]);
    assert.equal(deeperBrief.cached, false);
    assert.equal(deeperBrief.analyticsLevel, "business");
    const upgraded = await rpc("reserve_included_report", [bid, 30]);
    assert.equal(upgraded.ready, false);
    assert.equal(upgraded.reportId, reserved.reportId);
    assert.equal(upgraded.calculated.asOf, report.asOf);
    assert.deepEqual(upgraded.calculated.metrics, report.metrics);
    await assert.rejects(
      rpc("reserve_included_report", [bid, 30]),
      /already being prepared/,
    );
    await db.exec("set role service_role");
    await rpc("complete_business_report", [
      bid,
      reserved.reportId,
      {
        ...report,
        analysisLevel: "business",
        aiAvailable: false,
        aiSummary: null,
      },
    ]);
    await identity(owner);
    assert.equal(
      (await rpc("reserve_included_report", [bid, 30])).ready,
      true,
      "provider retries have a cooldown",
    );
    await db.exec("reset role");
    await db.query(
      "update analytics_reports set generated_at=now()-interval '6 minutes' where id=$1",
      [reserved.reportId],
    );
    await identity(owner);
    const retry = await rpc("reserve_included_report", [bid, 30]);
    assert.equal(retry.ready, false);
    assert.equal(retry.calculated.asOf, report.asOf);
    assert.equal(retry.reportId, reserved.reportId);
  } finally {
    await db.close();
  }
});
