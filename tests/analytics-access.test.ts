import assert from "node:assert/strict";
import { test } from "node:test";
import { buildAnalytics } from "../src/lib/analytics.ts";
import { analyticsLevel, scopeAnalytics } from "../src/lib/analytics-access.ts";
import { emptyState } from "../src/lib/domain.ts";
test("Growth summaries exclude Business breakdowns without mutating the original report", () => {
  const full = {
    ...buildAnalytics(emptyState),
    aiSummary: {
      summary: "Recorded figures",
      observations: ["a", "b", "c"],
      actions: ["a", "b", "c"],
    },
  };
  const summary = scopeAnalytics(full, "growth");
  assert.equal(summary.intelligence, undefined);
  assert.deepEqual(summary.products, []);
  assert.deepEqual(summary.creditAge, []);
  assert.deepEqual(summary.paymentMix, []);
  assert.equal(summary.aiSummary?.actions.length, 2);
  assert.equal(summary.metrics.revenue, full.metrics.revenue);
  assert.ok(full.intelligence);
  assert.equal(scopeAnalytics(full, "business"), full);
  assert.throws(() => scopeAnalytics(full, "none"), /Growth and Business/);
  assert.equal(
    analyticsLevel({ tier: "starter", analyticsLevel: "business" }),
    "none",
  );
});
