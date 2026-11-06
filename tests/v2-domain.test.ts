import { createHmac, randomUUID } from "node:crypto";
import { webhooks } from "@bachs/sdk";
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  parseCSV,
  csvExport,
  suggestMapping,
  validateImport,
  applyRecordImport,
  recordExport,
  type ImportKind,
} from "../src/lib/record-import.ts";
import { emptyState, paidFor, type State } from "../src/lib/domain.ts";
import { parseReceiptDetails } from "../src/lib/receipt-details.ts";
import { parseBackup } from "../src/lib/backup.ts";
import { buildAnalytics } from "../src/lib/analytics.ts";
import { readSpreadsheet } from "../src/lib/import-worker.ts";
import {
  validateBachsPayment,
  safeCheckoutUrl,
} from "../src/lib/server/bachs.ts";
import * as XLSX from "xlsx";
test("receipt descriptions and identifiers survive backups and stay bound to the original item", () => {
  const businessId = randomUUID(),
    productId = randomUUID();
  const state: State = {
    products: [
      {
        id: productId,
        name: "Phone",
        category: "Devices",
        unit: "phone",
        stock: 0,
        cost: 100,
        price: 200,
        threshold: 1,
      },
    ],
    movements: [],
    payments: [],
    sales: [
      {
        id: randomUUID(),
        createdAt: new Date().toISOString(),
        total: 200,
        paid: 200,
        customer: "Ada",
        method: "Cash",
        sync: "synced",
        lines: [
          {
            productId,
            name: "Phone",
            unit: "phone",
            quantity: 1,
            cost: 100,
            price: 200,
          },
        ],
      },
    ],
  };
  const details = parseReceiptDetails(
    {
      description: "Device with accessories",
      items: [
        {
          lineIndex: 0,
          productId,
          description: "Black, 256 GB",
          identifierType: "imei",
          identifiers: ["490154203237518"],
        },
      ],
    },
    state.sales[0],
  );
  state.sales[0].receiptDetails = details;
  state.sales[0].receiptRevision = 2;
  state.sales[0].receiptUpdatedAt = new Date().toISOString();
  const restored = parseBackup(
    JSON.stringify({ businessId, version: 2, ...state }),
    businessId,
  );
  assert.deepEqual(restored.sales[0].receiptDetails, details);
  assert.equal(restored.sales[0].receiptRevision, 2);
  assert.equal(restored.sales[0].total, 200);
  assert.throws(
    () =>
      parseReceiptDetails(
        { ...details, items: [{ ...details.items[0], identifiers: ["123"] }] },
        state.sales[0],
      ),
    /15 digits/,
  );
  assert.throws(
    () =>
      parseReceiptDetails(
        {
          ...details,
          items: [{ ...details.items[0], productId: randomUUID() }],
        },
        state.sales[0],
      ),
    /original sale/,
  );
  assert.throws(
    () => parseReceiptDetails({ ...details, total: 1 }),
    /Unrecognized/,
  );
  assert.throws(
    () =>
      parseBackup(
        JSON.stringify({
          businessId,
          version: 2,
          ...state,
          sales: [
            {
              ...state.sales[0],
              receiptDetails: {
                ...details,
                items: [{ ...details.items[0], productId: randomUUID() }],
              },
            },
          ],
        }),
        businessId,
      ),
    /original sale/,
  );
});
const inventory =
  "Product name,Stock unit,Quantity,Cost per unit,Selling price\r\nRice,bag,10,1000.50,1500";
const checked = (text: string, kind: ImportKind, state = emptyState) => {
  const table = parseCSV(text),
    result = validateImport(
      table,
      suggestMapping(table.headers, kind),
      kind,
      state,
    );
  assert.deepEqual(result.errors, []);
  return result.rows;
};
test("CSV handles quoted text and guards invalid money, dates and broken files", () => {
  const table = parseCSV(
    '\uFEFFName;Unit;Notes\r\n"Rice; beans";bag;"line 1\nline 2"',
  );
  assert.equal(table.rows[0][0], "Rice; beans");
  assert.equal(table.rows[0][2], "line 1\nline 2");
  assert.throws(() => parseCSV('A,B\n"unclosed,2'), /closing quote/);
  assert.ok(
    csvExport([['=HYPERLINK("bad")', " +cmd", "safe"]]).includes("'=HYPERLINK"),
  );
  const bad = parseCSV(inventory.replace("1000.50", '"1,00.50"'));
  assert.match(
    validateImport(
      bad,
      suggestMapping(bad.headers, "inventory"),
      "inventory",
      emptyState,
    ).errors[0],
    /digit grouping/,
  );
  const badDate = parseCSV(
    "Sale reference,Date,Product name,Quantity,Unit price,Amount received\nsale-1,2026-02-30,Rice,1,1500,1500",
  );
  const state = {
    ...emptyState,
    products: [
      {
        id: "rice",
        name: "Rice",
        unit: "bag",
        cost: 100,
        price: 200,
        stock: 10,
        threshold: 2,
        category: "Food",
      },
    ],
  };
  assert.match(
    validateImport(
      badDate,
      suggestMapping(badDate.headers, "sales"),
      "sales",
      state,
    ).errors[0],
    /calendar/,
  );
});
test("inventory delivery imports are atomic and repeatable; historical sales keep current stock", async () => {
  const rows = checked(inventory, "inventory");
  const first = await applyRecordImport(
    emptyState,
    rows,
    "inventory",
    "business",
    "receive",
    "delivery-1",
  );
  assert.equal(first.state.products[0].cost, 100050);
  assert.equal(first.state.products[0].stock, 10);
  const replay = await applyRecordImport(
    first.state,
    rows,
    "inventory",
    "business",
    "receive",
    "delivery-1",
  );
  assert.equal(replay.skipped, 1);
  assert.equal(replay.state.products[0].stock, 10);
  await assert.rejects(
    applyRecordImport(
      first.state,
      [{ ...rows[0], quantity: 20 }],
      "inventory",
      "business",
      "receive",
      "delivery-1",
    ),
    /already used/,
  );
  assert.equal(first.state.products[0].stock, 10);
  const delivery = await applyRecordImport(
    first.state,
    rows,
    "inventory",
    "business",
    "receive",
    "delivery-2",
  );
  assert.equal(delivery.state.products[0].stock, 20);
  const sales = checked(
    "Sale reference,Date,Product name,Quantity,Unit price,Amount received,Customer\nsale-1,2026-01-02,Rice,2,1500,1000,Ada",
    "sales",
    delivery.state,
  );
  const historical = await applyRecordImport(
    delivery.state,
    sales,
    "sales",
    "business",
  );
  assert.equal(historical.state.products[0].stock, 20);
  const product = historical.state.products[0];
  assert.equal(
    historical.state.movements
      .filter((m) => m.productId === product.id)
      .reduce((sum, m) => sum + m.quantity, 0) -
      historical.state.sales
        .flatMap((s) => s.lines)
        .reduce((sum, l) => sum + l.quantity, 0),
    20,
  );
  assert.equal(
    (await applyRecordImport(historical.state, sales, "sales", "business"))
      .skipped,
    1,
  );
  const exported = parseCSV(csvExport(recordExport(historical.state, "sales")));
  const validated = validateImport(
    exported,
    suggestMapping(exported.headers, "sales"),
    "sales",
    historical.state,
  );
  assert.deepEqual(validated.errors, []);
  assert.equal(
    (
      await applyRecordImport(
        historical.state,
        validated.rows,
        "sales",
        "business",
      )
    ).skipped,
    1,
  );
  const repayments = checked(
    "Payment reference,Sale reference,Date,Amount,Payment method\npay-1,sale-1,2026-01-03,500,Transfer",
    "repayments",
  );
  const result = await applyRecordImport(
    historical.state,
    repayments,
    "repayments",
    "business",
  );
  assert.equal(paidFor(result.state, result.state.sales[0]), 150000);
  assert.equal(
    (
      await applyRecordImport(
        result.state,
        repayments,
        "repayments",
        "business",
      )
    ).skipped,
    1,
  );
});
test("Excel reads values and rejects formulas and oversized worksheets", () => {
  const book = XLSX.utils.book_new(),
    sheet = XLSX.utils.aoa_to_sheet([
      ["Product", "Qty"],
      ["Rice", 2],
    ]);
  XLSX.utils.book_append_sheet(book, sheet, "Stock");
  let buffer = XLSX.write(book, { bookType: "xlsx", type: "array" });
  assert.equal(readSpreadsheet(buffer).rows[0][1], "2");
  sheet.B2 = { t: "n", f: "1+1", v: 2 };
  buffer = XLSX.write(book, { bookType: "xlsx", type: "array" });
  assert.throws(() => readSpreadsheet(buffer), /formulas/);
  sheet.B2 = { t: "n", v: 2 };
  sheet["!ref"] = "A1:B1002";
  buffer = XLSX.write(book, { bookType: "xlsx", type: "array" });
  assert.throws(() => readSpreadsheet(buffer), /1,000/);
});
test("analytics separates collections from sales and uses recorded costs and Lagos dates", () => {
  const product = {
    id: "rice",
    name: "Rice",
    unit: "bag",
    stock: 5,
    cost: 9999,
    price: 15000,
    threshold: 2,
    category: "Food",
  };
  const sale = {
    id: "sale",
    createdAt: "2026-11-03T23:30:00Z",
    lines: [
      {
        productId: "rice",
        name: "Rice",
        unit: "bag",
        quantity: 2,
        cost: 10000,
        price: 15000,
      },
    ],
    total: 30000,
    paid: 10000,
    customer: "Ada",
    method: "Cash",
    sync: "synced" as const,
  };
  const old = { ...sale, id: "old", createdAt: "2026-01-01T08:00:00Z" };
  const state = {
    products: [product],
    sales: [sale, old],
    movements: [],
    payments: [
      {
        id: "pay",
        saleId: "old",
        amount: 5000,
        createdAt: "2026-11-04T09:00:00Z",
        method: "Transfer",
      },
    ],
  };
  const report = buildAnalytics(state, 7, new Date("2026-11-04T12:00:00Z"));
  assert.equal(report.metrics.revenue, 30000);
  assert.equal(report.metrics.collected, 15000);
  assert.equal(report.metrics.grossProfit, 10000);
  assert.equal(report.metrics.credit, 35000);
  assert.equal(report.daily.find((d) => d.date === "2026-11-04")?.sales, 1);
  assert.equal(
    report.daily.reduce((s, d) => s + d.revenue, 0),
    30000,
  );
  assert.equal(
    report.insights.some((i) => /Sales (up|down)/.test(i.title)),
    false,
  );
  assert.doesNotThrow(() => JSON.stringify(report));
});
test("verified Bachs payments must match checkout, currency, amount and order reference", () => {
  const order = {
      id: "order",
      checkout_id: "checkout",
      amount: 2500000,
      currency: "NGN",
    },
    checkout = {
      checkout_id: "checkout",
      status: "completed",
      reference: "order",
      amount: "25000.00",
      currency: "NGN",
    },
    payment = {
      payment_id: "payment",
      checkout_id: "checkout",
      status: "succeeded",
      amount: "25000.00",
      currency: "NGN",
    };
  assert.doesNotThrow(() => validateBachsPayment(order, checkout, payment));
  for (const change of [
    { amount: "250.00" },
    { currency: "USD" },
    { checkout_id: "other" },
    { status: "pending" },
  ])
    assert.throws(
      () => validateBachsPayment(order, checkout, { ...payment, ...change }),
      /match/,
    );
  assert.throws(
    () =>
      validateBachsPayment(order, { ...checkout, reference: "other" }, payment),
    /match/,
  );
  assert.equal(
    safeCheckoutUrl("https://checkout.bachs.io/session"),
    "https://checkout.bachs.io/session",
  );
  for (const url of [
    "http://bachs.io/",
    "https://bachs.io.evil.test/",
    "javascript:alert(1)",
  ])
    assert.throws(() => safeCheckoutUrl(url));
});

test("Bachs signatures reject tampering, expired deliveries and missing signatures", () => {
  const body = JSON.stringify({
      id: "evt_test",
      type: "checkout.completed",
      created_at: new Date().toISOString(),
      organization_id: "org_test",
      data: { checkout_id: "chk_test" },
    }),
    secret = "test-only-webhook-secret",
    timestamp = String(Math.floor(Date.now() / 1000));
  const signature = createHmac("sha256", secret)
      .update(timestamp + "." + body)
      .digest("hex"),
    headers = { "X-Bachs-Signature-V2": `t=${timestamp},v1=${signature}` };
  assert.equal(webhooks.constructEvent(body, headers, secret).id, "evt_test");
  assert.throws(
    () => webhooks.constructEvent(body + " ", headers, secret),
    /match/,
  );
  assert.throws(() => webhooks.constructEvent(body, {}, secret), /timestamp/);
  assert.throws(
    () =>
      webhooks.constructEvent(
        body,
        { "X-Bachs-Signature-V2": `t=1,v1=${signature}` },
        secret,
      ),
    /tolerance/,
  );
});
