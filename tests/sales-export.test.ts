import { test } from "node:test";
import assert from "node:assert/strict";
import {
  filterSales,
  salesRange,
  salesSummaryRows,
  type SalesPeriod,
} from "../src/lib/sales-export.ts";
import { emptyState, type Sale } from "../src/lib/domain.ts";
const sale = (id: string, date: string): Sale => ({
  id,
  createdAt: date,
  total: 69000000,
  paid: 60000000,
  method: "Cash",
  customer: "Ada",
  sync: "synced",
  lines: [
    {
      productId: "p",
      name: "Phone",
      unit: "phone",
      quantity: 1,
      cost: 60000000,
      price: 69000000,
      originalPrice: 70000000,
    },
  ],
});
test("sales filters use Lagos dates and selected calendar weeks, months and inclusive date ranges", () => {
  const sales = [
    sale("late", "2026-11-17T23:30:00Z"),
    sale("prior", "2026-11-17T09:00:00Z"),
    sale("dec", "2026-12-01T00:00:00Z"),
  ];
  const period: SalesPeriod = {
    mode: "day",
    date: "2026-11-18",
    end: "2026-11-18",
  };
  assert.deepEqual(
    filterSales(sales, period).map((s) => s.id),
    ["late"],
  );
  assert.deepEqual(salesRange({ ...period, mode: "week" }), {
    start: "2026-11-16",
    end: "2026-11-22",
    label: "week-2026-11-16",
  });
  assert.equal(
    filterSales(sales, { ...period, mode: "month", date: "2026-11" }).length,
    2,
  );
  assert.equal(
    salesRange({ ...period, mode: "month", date: "2028-02" })?.end,
    "2028-02-29",
  );
  assert.equal(
    filterSales(sales, {
      ...period,
      mode: "range",
      date: "2026-11-17",
      end: "2026-12-01",
    }).length,
    3,
  );
  assert.throws(
    () =>
      salesRange({
        ...period,
        mode: "range",
        date: "2026-11-18",
        end: "2026-11-17",
      }),
    /end date/,
  );
  assert.throws(
    () => salesRange({ ...period, date: "2026-02-30" }),
    /valid calendar/,
  );
  const state = {
    ...emptyState,
    sales,
    payments: [
      {
        id: "repayment",
        saleId: "late",
        amount: 9000000,
        method: "Transfer",
        createdAt: "2026-12-02T10:00:00Z",
      },
    ],
  };
  const rows = salesSummaryRows(state, filterSales(sales, period));
  assert.equal(rows[1][3], 690000);
  assert.equal(rows[1][5], 90000);
  assert.equal(rows[1][6], 10000);
  assert.equal(rows[1][8], 690000);
  assert.equal(rows[1][9], 0);
});
