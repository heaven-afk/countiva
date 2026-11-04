import {
  paidFor,
  recordPayment,
  toKobo,
  type Product,
  type Sale,
  type State,
} from "./domain.ts";
export type ImportKind = "inventory" | "sales" | "repayments";
export type ImportTable = {
  headers: string[];
  rows: string[][];
  sheetNames?: string[];
};
export type ColumnMap = Record<string, number>;
const specs = {
  inventory: [
    ["name", "Product name", true],
    ["unit", "Stock unit", true],
    ["quantity", "Opening / received quantity", true],
    ["cost", "Cost per unit (₦)", true],
    ["price", "Selling price (₦)", true],
    ["category", "Category", false],
    ["threshold", "Low-stock alert", false],
  ],
  sales: [
    ["reference", "Sale reference", true],
    ["date", "Sale date (ISO format)", true],
    ["name", "Product name", true],
    ["unit", "Stock unit", false],
    ["quantity", "Quantity sold", true],
    ["price", "Unit selling price (₦)", true],
    ["paid", "Amount received for this sale (₦)", true],
    ["customer", "Customer / credit reference", false],
    ["method", "Payment method", false],
    ["cost", "Historical cost per unit (₦)", false],
  ],
  repayments: [
    ["reference", "Payment reference", true],
    ["saleReference", "Sale reference", true],
    ["date", "Payment date (ISO format)", true],
    ["amount", "Amount (₦)", true],
    ["method", "Payment method", false],
  ],
} as const;
export const importFields = (kind: ImportKind) => specs[kind];
const aliases: Record<string, string[]> = {
  name: ["name", "product", "productname", "item", "itemname"],
  unit: ["unit", "stockunit", "uom"],
  quantity: [
    "quantity",
    "qty",
    "stock",
    "openingstock",
    "instock",
    "quantitysold",
  ],
  cost: ["cost", "costperunit", "purchaseprice", "historicalcostperunit"],
  price: ["price", "sellingprice", "unitprice", "unitsellingprice"],
  category: ["category"],
  threshold: ["threshold", "lowstockalert", "alertlevel"],
  reference: [
    "reference",
    "id",
    "salereference",
    "paymentreference",
    "recordid",
    "orderid",
  ],
  saleReference: ["salereference", "saleid"],
  date: ["date", "createdat", "saledate", "paymentdate"],
  paid: ["paid", "amountreceived", "amountpaid", "received"],
  customer: ["customer", "customername"],
  method: ["method", "paymentmethod"],
  amount: ["amount", "paymentamount"],
};
const normal = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");
export function suggestMapping(headers: string[], kind: ImportKind): ColumnMap {
  return Object.fromEntries(
    specs[kind].map(([key]) => [
      key,
      headers.findIndex((header) =>
        aliases[key]?.includes(normal(header.replace(/\(.*?\)/g, ""))),
      ),
    ]),
  );
}
export function parseCSV(text: string): ImportTable {
  if (text.length > 5_000_000) throw new Error("Choose a file under 5 MB.");
  text = text.replace(/^\uFEFF/, "");
  if (text.includes("\0"))
    throw new Error("This is not a supported text file.");
  let delimiter = ",";
  const first = text.split(/\r?\n/)[0];
  if (/^sep=[,;\t]$/.test(first)) {
    delimiter = first.slice(4);
    text = text.slice(first.length).replace(/^\r?\n/, "");
  } else {
    const count = (char: string) => {
      let quote = false,
        n = 0;
      for (const c of first) {
        if (c === '"') quote = !quote;
        else if (c === char && !quote) n++;
      }
      return n;
    };
    delimiter = [",", ";", "\t"].sort((a, b) => count(b) - count(a))[0];
  }
  const data: string[][] = [];
  let row: string[] = [],
    cell = "",
    quoted = false,
    closed = false;
  const field = () => {
    row.push(cell);
    cell = "";
    closed = false;
  };
  const line = () => {
    field();
    if (row.some((s) => s.trim())) data.push(row);
    row = [];
    if (data.length > 1001)
      throw new Error("Import up to 1,000 data rows at a time.");
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          quoted = false;
          closed = true;
        }
      } else cell += c;
    } else if (c === '"' && !cell && !closed) {
      quoted = true;
    } else if (c === delimiter) {
      field();
    } else if (c === "\r" || c === "\n") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      line();
    } else if (closed && !/\s/.test(c)) {
      throw new Error(
        "A quoted CSV field has unexpected text after its closing quote.",
      );
    } else if (!closed) cell += c;
  }
  if (quoted) throw new Error("A CSV field is missing its closing quote.");
  if (cell || row.length) line();
  if (data.length < 2)
    throw new Error("The file needs a header row and at least one data row.");
  const headers = data.shift()!.map((h) => h.trim());
  if (data.some((row) => row.length > headers.length))
    throw new Error(
      "A data row has more fields than the header. Put amounts containing commas in quotes, or use an Excel file.",
    );
  if (headers.length > 30)
    throw new Error("Use a file with no more than 30 columns.");
  return { headers, rows: data };
}
export function csvExport(rows: unknown[][]): string {
  return (
    "\uFEFF" +
    rows
      .map((row) =>
        row
          .map((value) => {
            let text = String(value ?? "");
            if (typeof value === "string" && /^[\s]*[=+@\-\t\r]/.test(text))
              text = "'" + text;
            return '"' + text.replaceAll('"', '""') + '"';
          })
          .join(","),
      )
      .join("\r\n")
  );
}
export function recordExport(state: State, kind: ImportKind): unknown[][] {
  if (kind === "inventory")
    return [
      [
        "Product name",
        "Stock unit",
        "Quantity",
        "Cost per unit",
        "Selling price",
        "Category",
        "Low-stock alert",
      ],
      ...state.products.map((p) => [
        p.name,
        p.unit,
        p.stock,
        p.cost / 100,
        p.price / 100,
        p.category,
        p.threshold,
      ]),
    ];
  if (kind === "sales")
    return [
      [
        "Sale reference",
        "Date",
        "Product name",
        "Stock unit",
        "Quantity",
        "Unit price",
        "Amount received",
        "Customer",
        "Payment method",
        "Cost per unit",
      ],
      ...state.sales.flatMap((s) =>
        s.lines.map((l) => [
          s.id,
          s.createdAt,
          l.name,
          l.unit,
          l.quantity,
          l.price / 100,
          s.paid / 100,
          s.customer,
          s.method,
          l.cost / 100,
        ]),
      ),
    ];
  return [
    ["Payment reference", "Sale reference", "Date", "Amount", "Payment method"],
    ...state.payments.map((p) => [
      p.id,
      p.saleId,
      p.createdAt,
      p.amount / 100,
      p.method,
    ]),
  ];
}
export const importTemplate = (kind: ImportKind) =>
  recordExport(
    { products: [], sales: [], payments: [], movements: [] },
    kind,
  )[0];
function value(row: string[], mapping: ColumnMap, key: string) {
  const text = (row[mapping[key]] ?? "").trim();
  return /^'[=+@-]/.test(text) ? text.slice(1) : text;
}
function whole(input: string, label: string, zero = true) {
  if (
    !/^\d+$/.test(input) ||
    !Number.isSafeInteger(+input) ||
    +input < (zero ? 0 : 1) ||
    +input > 100000000
  )
    throw new Error(
      `${label} must be a ${zero ? "non-negative" : "positive"} whole number.`,
    );
  return +input;
}
function amount(input: string, label: string) {
  let clean = input.replace(/^(?:NGN|₦)\s*/i, "");
  if (clean.includes(",") && !/^\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?$/.test(clean))
    throw new Error(`${label} has invalid digit grouping.`);
  clean = clean.replace(/,/g, "");
  if (!/^\d+(?:\.\d{1,2})?$/.test(clean))
    throw new Error(
      `${label} needs a valid amount with up to 2 decimal places.`,
    );
  return toKobo(clean);
}
function dateStamp(input: string) {
  if (
    !/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})?)?$/.test(
      input,
    )
  )
    throw new Error(
      "Use an ISO date such as 2026-11-04 or 2026-11-04T10:30:00+01:00.",
    );
  const [year, month, day] = input.slice(0, 10).split("-").map(Number);
  const check = new Date(Date.UTC(year, month - 1, day));
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day
  )
    throw new Error("The date is not a valid calendar date.");
  const full =
    input.length === 10
      ? `${input}T00:00:00+01:00`
      : /Z$|[+-]\d\d:\d\d$/.test(input)
        ? input
        : `${input}+01:00`;
  const date = new Date(full);
  if (!Number.isFinite(date.getTime()) || date.getTime() > Date.now() + 300000)
    throw new Error("The date is invalid or in the future.");
  return date.toISOString();
}
export type ImportRow = {
  sourceRow: number;
  reference?: string;
  saleReference?: string;
  date?: string;
  name?: string;
  unit?: string;
  quantity?: number;
  cost?: number;
  price?: number;
  category?: string;
  threshold?: number;
  paid?: number;
  customer?: string;
  method?: string;
  amount?: number;
};
export function validateImport(
  table: ImportTable,
  mapping: ColumnMap,
  kind: ImportKind,
  state: State,
) {
  const errors: string[] = [],
    rows: ImportRow[] = [];
  for (const [key, label, required] of specs[kind])
    if (required && (mapping[key] === undefined || mapping[key] < 0))
      errors.push(`Map the ${label} column.`);
  if (errors.length) return { rows, errors };
  if (table.rows.length > 1000)
    return { rows, errors: ["Import up to 1,000 rows at a time."] };
  table.rows.forEach((row, index) => {
    try {
      const get = (key: string) => value(row, mapping, key);
      if (kind === "inventory") {
        const name = get("name"),
          unit = get("unit");
        if (!name || name.length > 120 || !unit || unit.length > 80)
          throw new Error(
            "Enter a product name (up to 120 characters) and stock unit (up to 80).",
          );
        rows.push({
          sourceRow: index + 2,
          name,
          unit,
          quantity: whole(get("quantity"), "Quantity"),
          cost: amount(get("cost"), "Cost"),
          price: amount(get("price"), "Selling price"),
          category: get("category") || "General",
          threshold: get("threshold")
            ? whole(get("threshold"), "Low-stock alert")
            : 5,
        });
      } else if (kind === "sales") {
        const reference = get("reference"),
          name = get("name"),
          matches = state.products.filter(
            (p) =>
              p.name.toLowerCase() === name.toLowerCase() &&
              (!get("unit") ||
                p.unit.toLowerCase() === get("unit").toLowerCase()),
          ),
          product = matches[0];
        if (matches.length > 1)
          throw new Error(
            "This product name has more than one stock unit. Map the stock unit column to identify it.",
          );
        if (!reference || reference.length > 200)
          throw new Error("A unique sale reference is required.");
        if (!product)
          throw new Error(`Add or import “${name}” to your catalogue first.`);
        rows.push({
          sourceRow: index + 2,
          reference,
          date: dateStamp(get("date")),
          name: product.name,
          unit: product.unit,
          quantity: whole(get("quantity"), "Quantity", false),
          price: amount(get("price"), "Unit price"),
          cost: get("cost")
            ? amount(get("cost"), "Historical cost")
            : product.cost,
          paid: amount(get("paid"), "Amount received"),
          customer: get("customer"),
          method: get("method") || "Cash",
        });
      } else {
        const reference = get("reference"),
          saleReference = get("saleReference");
        if (!reference || !saleReference)
          throw new Error(
            "Both the payment and original sale references are required.",
          );
        rows.push({
          sourceRow: index + 2,
          reference,
          saleReference,
          date: dateStamp(get("date")),
          amount: amount(get("amount"), "Payment amount"),
          method: get("method") || "Cash",
        });
      }
    } catch (e) {
      errors.push(`Row ${index + 2}: ${(e as Error).message}`);
    }
  });
  return { rows, errors };
}
async function uuid(text: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text),
  );
  const bytes = new Uint8Array(digest).slice(0, 16);
  bytes[6] = (bytes[6] & 15) | 80;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(
    "",
  );
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
const referenceId = async (
  businessId: string,
  kind: string,
  reference: string,
) =>
  /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(reference)
    ? reference
    : uuid(`${businessId}:${kind}:${reference}`);
export async function applyRecordImport(
  state: State,
  rows: ImportRow[],
  kind: ImportKind,
  businessId: string,
  existing: "skip" | "receive" = "skip",
  batchReference = "",
): Promise<{ state: State; added: number; skipped: number }> {
  let next: State = {
      products: state.products.map((p) => ({ ...p })),
      movements: [...state.movements],
      sales: [...state.sales],
      payments: [...state.payments],
    },
    added = 0,
    skipped = 0;
  if (kind === "inventory") {
    const canonical = JSON.stringify(
      rows.map(({ sourceRow, ...r }) => JSON.stringify(r)).sort(),
    );
    const batch = await uuid(`${businessId}:${batchReference || canonical}`);
    const occurrences = new Map<string, number>();
    for (const row of rows) {
      const identity = `${row.name!.toLowerCase()}:${row.unit!.toLowerCase()}`;
      const occurrence = occurrences.get(identity) || 0;
      occurrences.set(identity, occurrence + 1);
      const movementId = await uuid(`${batch}:${identity}:${occurrence}`);
      const prior = next.movements.find((m) => m.id === movementId);
      if (prior) {
        if (prior.quantity !== row.quantity)
          throw new Error(
            "This import reference was already used with different quantities. Review the file or choose a new reference for a new delivery.",
          );
        skipped++;
        continue;
      }
      let product = next.products.find(
        (p) =>
          p.name.toLowerCase() === row.name!.toLowerCase() &&
          p.unit.toLowerCase() === row.unit!.toLowerCase(),
      );
      if (product && existing === "skip") {
        skipped++;
        continue;
      }
      if (!product) {
        const id = await uuid(
          `${businessId}:product:${row.name!.toLowerCase()}:${row.unit!.toLowerCase()}`,
        );
        product = {
          id,
          name: row.name!,
          unit: row.unit!,
          stock: 0,
          cost: row.cost!,
          price: row.price!,
          threshold: row.threshold!,
          category: row.category!,
        };
        next.products.push(product);
      }
      product.stock += row.quantity!;
      if (!Number.isSafeInteger(product.stock))
        throw new Error("Imported stock is too large.");
      next.movements.push({
        id: movementId,
        productId: product.id,
        quantity: row.quantity!,
        reason: "Reviewed inventory file import",
        createdAt: new Date().toISOString(),
      });
      added++;
    }
  } else if (kind === "sales") {
    const groups = new Map<string, ImportRow[]>();
    for (const row of rows)
      groups.set(row.reference!, [...(groups.get(row.reference!) || []), row]);
    for (const [reference, lines] of groups) {
      if (lines.length > 500)
        throw new Error(`Sale ${reference} has more than 500 lines.`);
      const first = lines[0];
      if (
        lines.some(
          (l) =>
            l.date !== first.date ||
            l.paid !== first.paid ||
            l.customer !== first.customer ||
            l.method !== first.method,
        )
      )
        throw new Error(
          `Rows for sale ${reference} disagree on date, payment or customer.`,
        );
      const id = await referenceId(businessId, "sale", reference);
      const sale: Sale = {
        id,
        createdAt: first.date!,
        total: 0,
        paid: first.paid!,
        customer: first.customer || "",
        method: first.method || "Cash",
        sync: "pending",
        lines: lines.map((row) => {
          const p = next.products.find(
            (p) =>
              p.name.toLowerCase() === row.name!.toLowerCase() &&
              (!row.unit || p.unit.toLowerCase() === row.unit.toLowerCase()),
          );
          if (!p) throw new Error(`Product ${row.name} was not found.`);
          return {
            productId: p.id,
            name: p.name,
            unit: p.unit,
            quantity: row.quantity!,
            price: row.price!,
            cost: row.cost!,
          };
        }),
      };
      sale.total = sale.lines.reduce((sum, l) => sum + l.quantity * l.price, 0);
      if (
        !Number.isSafeInteger(sale.total) ||
        sale.paid > sale.total ||
        (sale.paid < sale.total && !sale.customer.trim())
      )
        throw new Error(
          `Sale ${reference}: check the total, payment and customer for credit.`,
        );
      const old = next.sales.find((s) => s.id === id);
      if (old) {
        if (
          old.total !== sale.total ||
          old.paid !== sale.paid ||
          JSON.stringify(
            old.lines
              .map((l) => [
                l.productId,
                l.name,
                l.unit,
                l.quantity,
                l.price,
                l.cost,
              ])
              .sort(),
          ) !==
            JSON.stringify(
              sale.lines
                .map((l) => [
                  l.productId,
                  l.name,
                  l.unit,
                  l.quantity,
                  l.price,
                  l.cost,
                ])
                .sort(),
            )
        )
          throw new Error(
            `Sale reference ${reference} conflicts with an existing record.`,
          );
        skipped++;
        continue;
      }
      next.sales.push(sale);
      for (let i = 0; i < sale.lines.length; i++) {
        const line = sale.lines[i];
        next.movements.push({
          id: await uuid(`${businessId}:historical-offset:${id}:${i}`),
          productId: line.productId,
          quantity: line.quantity,
          reason:
            `Historical sale import offset (current stock unchanged): ${reference}`.slice(
              0,
              500,
            ),
          createdAt: sale.createdAt,
        });
      }
      added++;
    }
  } else {
    for (const row of rows) {
      const id = await referenceId(businessId, "payment", row.reference!),
        saleId = await referenceId(businessId, "sale", row.saleReference!);
      const old = next.payments.find((p) => p.id === id);
      if (old) {
        if (old.saleId !== saleId || old.amount !== row.amount)
          throw new Error(
            `Payment reference ${row.reference} conflicts with an existing record.`,
          );
        skipped++;
        continue;
      }
      next = recordPayment(next, {
        id,
        saleId,
        amount: row.amount!,
        method: row.method!,
        createdAt: row.date!,
      });
      added++;
    }
  }
  return { state: next, added, skipped };
}
