import assert from "node:assert/strict";
import { test } from "node:test";
import { buildAnalytics } from "../src/lib/analytics.ts";
import { emptyState, type State } from "../src/lib/domain.ts";

test("premium intelligence separates collections, gross profit and idle stock without inventing overdue balances", () => {
  const state: State = {
    ...emptyState,
    products: [
      {
        id: "sold",
        name: "Phone",
        category: "Devices",
        unit: "phone",
        stock: 2,
        cost: 60000000,
        price: 70000000,
        threshold: 1,
      },
      {
        id: "idle",
        name: "Case",
        category: "Devices",
        unit: "case",
        stock: 10,
        cost: 200000,
        price: 400000,
        threshold: 2,
      },
      {
        id: "archived",
        name: "Archived",
        category: "Devices",
        unit: "unit",
        stock: 5,
        cost: 100,
        price: 200,
        threshold: 10,
        archivedAt: "2026-10-01T10:00:00Z",
      },
    ],
    sales: [
      {
        id: "sale",
        createdAt: "2026-11-17T10:00:00Z",
        total: 70000000,
        paid: 60000000,
        customer: "Ada",
        method: "Cash",
        sync: "synced",
        lines: [
          {
            productId: "sold",
            name: "Phone",
            unit: "phone",
            quantity: 1,
            cost: 60000000,
            price: 70000000,
          },
        ],
      },
    ],
    payments: [
      {
        id: "payment",
        saleId: "sale",
        createdAt: "2026-11-18T09:00:00Z",
        amount: 5000000,
        method: "Transfer",
      },
    ],
    movements: [],
  };
  const report = buildAnalytics(state, 7, new Date("2026-11-18T10:00:00Z"));
  assert.equal(report.metrics.revenue, 70000000);
  assert.equal(report.metrics.grossProfit, 10000000);
  assert.equal(report.metrics.collected, 65000000);
  assert.equal(report.metrics.credit, 5000000);
  assert.equal(report.metrics.inventoryAtCost, 122000000);
  assert.equal(report.intelligence.idleInventoryAtCost, 2000000);
  assert.equal(report.intelligence.idleProducts, 1);
  assert.equal(report.intelligence.repaymentsCollected, 5000000);
  assert.equal(report.intelligence.revenueChangePercent, null);
  assert.equal(
    report.products.find((p) => p.id === "sold")?.estimatedStockDays,
    14,
  );
  assert.equal(
    report.products.find((p) => p.id === "idle")?.estimatedStockDays,
    null,
  );
  assert.ok(
    report.intelligence.actionPlan.some(
      (a) => a.title === "Make a collection plan",
    ),
  );
  assert.ok(
    !report.insights
      .find((i) => i.kind === "stock")
      ?.title.includes("need a stock check"),
  );
  assert.ok(
    report.notes.some((n) => n.includes("Unknown historical discounts")),
  );
});
test("empty business reports have no fabricated margins or growth forecasts", () => {
  const report = buildAnalytics(
    emptyState,
    30,
    new Date("2026-11-18T10:00:00Z"),
  );
  assert.equal(report.metrics.grossMarginPercent, null);
  assert.equal(report.intelligence.initialCollectionPercent, null);
  assert.equal(report.intelligence.revenueChangePercent, null);
  assert.equal(
    report.intelligence.actionPlan[0].title,
    "Build a reliable operating picture",
  );
  assert.equal(report.daily.length, 30);
});
