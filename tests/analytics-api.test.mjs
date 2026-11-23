import { test } from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { buildAnalytics } from "../src/lib/analytics.ts";
import { emptyState } from "../src/lib/domain.ts";

test("actual report routes enforce plans, keep calculated results on AI failure and refresh cached brief amounts", async () => {
  const bid = "11111111-1111-4111-8111-111111111111";
  const calls = [];
  let accessFailure = null;
  let level = "growth",
    cached = false;
  const state = {
    ...emptyState,
    sales: [
      {
        id: "sale",
        createdAt: new Date().toISOString(),
        total: 120000,
        paid: 100000,
        customer: "Ada",
        method: "Cash",
        lines: [
          {
            productId: "p",
            name: "Phone",
            unit: "phone",
            quantity: 1,
            price: 120000,
            cost: 80000,
          },
        ],
      },
    ],
  };
  const authSource = `export async function authenticatedServer(){return {client:globalThis.__analyticsRouteClient,user:{id:'test'}}} export function serviceClient(){return globalThis.__analyticsRouteClient} export function verifyOrigin(){}`;
  const hooks = registerHooks({
    resolve(specifier, context, next) {
      if (specifier.endsWith("/lib/server/auth"))
        return {
          url: "data:text/javascript," + encodeURIComponent(authSource),
          shortCircuit: true,
        };
      if (specifier === "next/server") return next("next/server.js", context);
      if (specifier.startsWith(".") && context.parentURL?.startsWith("file:")) {
        const candidate = new URL(specifier + ".ts", context.parentURL);
        if (existsSync(fileURLToPath(candidate)))
          return { url: candidate.href, shortCircuit: true };
      }
      return next(specifier, context);
    },
  });
  globalThis.__analyticsRouteClient = {
    rpc: async (name, args) => {
      calls.push({ name, args });
      if (name === "business_entitlements" && accessFailure)
        return { data: null, error: accessFailure };
      if (name === "business_entitlements")
        return {
          data: {
            tier: level,
            analyticsLevel: level === "starter" ? "none" : level,
            hasAccess: true,
          },
        };
      if (name === "reserve_included_report")
        return { data: { ready: false, reportId: bid, snapshot: state } };
      if (name === "reserve_daily_insight")
        return {
          data: cached
            ? {
                cached: true,
                body: {
                  asOf: "2026-11-20T08:00:00Z",
                  brief: {
                    summary: "Earlier narrative",
                    observations: ["a", "b", "c"],
                    actions: ["a", "b", "c"],
                  },
                  financials: { salesMade: 999 },
                },
              }
            : { cached: false, snapshot: state },
        };
      if (name === "sync_workspace") return { data: state };
      return { data: null, error: null };
    },
  };
  const previousFetch = globalThis.fetch,
    previousKey = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = "test-key";
  globalThis.fetch = async () =>
    Response.json(
      { error: { message: "provider unavailable" } },
      { status: 503 },
    );
  try {
    const reports = await import("../src/app/api/analytics/report/route.ts");
    const insights = await import("../src/app/api/insights/route.ts");
    const request = (body) =>
      new Request("https://www.countiva.shop/api/analytics/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    level = "starter";
    assert.equal(
      (await reports.POST(request({ businessId: bid, days: 30 }))).status,
      403,
    );
    assert.equal(
      calls.some((c) => c.name === "reserve_included_report"),
      false,
    );
    level = "growth";
    assert.equal(
      (await reports.POST(request({ businessId: bid, days: 90 }))).status,
      403,
    );
    const result = await reports.POST(request({ businessId: bid, days: 30 }));
    assert.equal(
      result.status,
      200,
      "AI failure must not prevent a calculated report",
    );
    const { report } = await result.json();
    assert.equal(report.metrics.revenue, 120000);
    assert.equal(report.metrics.grossProfit, 40000);
    assert.equal(report.aiAvailable, false);
    assert.ok(report.aiError);
    assert.deepEqual(report.products, []);
    assert.equal(report.intelligence, undefined);
    assert.ok(
      calls.find((c) => c.name === "complete_business_report").args.report_data
        .intelligence,
      "saved calculations retain the upgrade breakdown",
    );
    cached = true;
    calls.length = 0;
    const brief = await (
      await insights.POST(request({ businessId: bid }))
    ).json();
    assert.equal(brief.financials.salesMade, 120000);
    assert.equal(brief.financials.collected, 100000);
    assert.equal(brief.financials.outstanding, 20000);
    assert.equal(brief.asOf, "2026-11-20T08:00:00Z");
    assert.notEqual(brief.financialsAsOf, brief.asOf);
    assert.equal(brief.brief.actions.length, 2);
    assert.ok(calls.some((c) => c.name === "sync_workspace"));
    assert.equal(
      calls.some((c) => c.name === "complete_daily_insight"),
      false,
      "cached reads must not overwrite a newer narrative",
    );
    level = "business";
    const business = await (
      await reports.POST(request({ businessId: bid, days: 90 }))
    ).json();
    assert.ok(business.report.intelligence);
    assert.equal(business.report.days, 90);
    accessFailure = { code: "PGRST202" };
    const missing = await reports.POST(request({ businessId: bid, days: 30 }));
    assert.equal(missing.status, 503);
    assert.match((await missing.json()).error, /database update/);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousKey == null) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = previousKey;
    delete globalThis.__analyticsRouteClient;
    hooks.deregister();
  }
});
