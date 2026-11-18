import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import {
  recordSale,
  discountFor,
  paidFor,
  type State,
  type Sale,
} from "../src/lib/domain.ts";
import { buildAnalytics } from "../src/lib/analytics.ts";
import { parseBackup, mergeBackup } from "../src/lib/backup.ts";
import {
  recordExport,
  suggestMapping,
  validateImport,
  applyRecordImport,
} from "../src/lib/record-import.ts";
const product = {
  id: randomUUID(),
  name: "Phone",
  category: "Devices",
  unit: "phone",
  stock: 3,
  cost: 60000000,
  price: 70000000,
  threshold: 1,
};
const state: State = {
  products: [product],
  sales: [],
  payments: [],
  movements: [
    {
      id: randomUUID(),
      productId: product.id,
      quantity: 3,
      reason: "Opening stock",
      createdAt: "2026-11-17T09:00:00Z",
    },
  ],
};
const sale = (agreed: number, paid: number): Sale => ({
  id: randomUUID(),
  createdAt: "2026-11-18T10:00:00Z",
  total: agreed,
  paid,
  customer: "Ada",
  method: "Cash",
  sync: "pending",
  dueDate: "2026-11-20",
  recordedByName: "Owner",
  lines: [
    {
      productId: product.id,
      name: product.name,
      unit: "phone",
      quantity: 1,
      cost: product.cost,
      price: agreed,
      originalPrice: product.price,
    },
  ],
});
for (const [name, agreed, paid, debt, profit, discount] of [
  ["A fully paid negotiated sale", 69000000, 69000000, 0, 9000000, 1000000],
  [
    "B partially paid negotiated sale",
    69000000,
    60000000,
    9000000,
    9000000,
    1000000,
  ],
  ["C full-price sale", 70000000, 70000000, 0, 10000000, 0],
] as const)
  test(name, () => {
    const entry = sale(agreed, paid),
      next = recordSale(state, entry),
      report = buildAnalytics(next, 1, new Date("2026-11-18T12:00:00Z"));
    assert.equal(next.products[0].price, 70000000);
    assert.equal(next.products[0].stock, 2);
    assert.equal(entry.total - paidFor(next, entry), debt);
    assert.equal(discountFor(entry), discount);
    assert.equal(report.metrics.revenue, agreed);
    assert.equal(report.metrics.grossProfit, profit);
    assert.equal(report.metrics.discountsGiven, discount);
    assert.equal(report.metrics.collected, paid);
    assert.equal(recordSale(next, entry), next);
  });
test("transaction terms survive backups and CSV round trips without inferring legacy discounts", async () => {
  const bid = randomUUID(),
    entry = sale(69000000, 69000000),
    next = recordSale(state, entry);
  const restored = parseBackup(
    JSON.stringify({ version: 2, businessId: bid, ...next }),
    bid,
  );
  assert.equal(discountFor(restored.sales[0]), 1000000);
  assert.equal(restored.sales[0].dueDate, "2026-11-20");
  assert.equal(mergeBackup(restored, restored).sales.length, 1);
  const exported = recordExport(next, "sales"),
    table = {
      headers: exported[0].map(String),
      rows: exported.slice(1).map((row) => row.map((v) => String(v ?? ""))),
    };
  const mapped = validateImport(
    table,
    suggestMapping(table.headers, "sales"),
    "sales",
    state,
  );
  assert.deepEqual(mapped.errors, []);
  const imported = await applyRecordImport(state, mapped.rows, "sales", bid);
  assert.equal(discountFor(imported.state.sales[0]), 1000000);
  assert.equal(imported.state.sales[0].dueDate, "2026-11-20");
  const old = {
    ...entry,
    lines: entry.lines.map(({ originalPrice, ...line }) => line),
  };
  assert.equal(discountFor(old), 0);
  assert.equal(
    buildAnalytics(
      { ...state, sales: [old] },
      1,
      new Date("2026-11-18T12:00:00Z"),
    ).unknownDiscountSales,
    1,
  );
  assert.throws(
    () => recordSale(state, { ...entry, dueDate: "2026-02-30" }),
    /due date/,
  );
  assert.throws(
    () =>
      recordSale(state, {
        ...entry,
        lines: [{ ...entry.lines[0], price: -1 }],
      }),
    /prices/,
  );
});
