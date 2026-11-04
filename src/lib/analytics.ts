import { money, paidFor, type State } from "./domain.ts";
const day = (value: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos" }).format(
    new Date(value),
  );
function total(values: number[]) {
  return values.reduce((sum, value) => {
    const next = sum + value;
    if (!Number.isSafeInteger(next))
      throw new Error("The report totals exceed the supported amount range.");
    return next;
  }, 0);
}
export function buildAnalytics(state: State, days = 30, now = new Date()) {
  if (![7, 30, 90].includes(days)) throw new Error("Choose 7, 30 or 90 days.");
  const end = Date.parse(`${day(now.toISOString())}T23:59:59.999+01:00`),
    start = end + 1 - days * 86400000;
  const sales = state.sales.filter(
      (s) => +new Date(s.createdAt) >= start && +new Date(s.createdAt) <= end,
    ),
    previous = state.sales.filter(
      (s) =>
        +new Date(s.createdAt) >= start - days * 86400000 &&
        +new Date(s.createdAt) < start,
    );
  const revenue = total(sales.map((s) => s.total)),
    previousRevenue = total(previous.map((s) => s.total)),
    cogs = total(sales.flatMap((s) => s.lines.map((l) => l.cost * l.quantity)));
  const repayments = state.payments.filter(
    (p) => +new Date(p.createdAt) >= start && +new Date(p.createdAt) <= end,
  );
  const collected = total([
      ...sales.map((s) => s.paid),
      ...repayments.map((p) => p.amount),
    ]),
    credit = total(state.sales.map((s) => s.total - paidFor(state, s)));
  const products = state.products
    .map((product) => {
      const lines = sales
        .flatMap((s) => s.lines)
        .filter((l) => l.productId === product.id);
      const units = total(lines.map((l) => l.quantity)),
        value = total(lines.map((l) => l.price * l.quantity)),
        cost = total(lines.map((l) => l.cost * l.quantity));
      return {
        id: product.id,
        name: product.name,
        unit: product.unit,
        stock: product.stock,
        threshold: product.threshold,
        units,
        revenue: value,
        cost,
        grossProfit: value - cost,
      };
    })
    .sort((a, b) => b.revenue - a.revenue);
  const daily = Array.from({ length: days }, (_, i) => {
    const date = day(new Date(start + i * 86400000 + 3600000).toISOString());
    const entries = sales.filter((s) => day(s.createdAt) === date);
    return {
      date,
      revenue: total(entries.map((s) => s.total)),
      sales: entries.length,
      grossProfit: total(
        entries.flatMap((s) =>
          s.lines.map((l) => (l.price - l.cost) * l.quantity),
        ),
      ),
    };
  });
  const paymentMix = Array.from(new Set(sales.map((s) => s.method))).map(
    (method) => ({
      method,
      sales: sales.filter((s) => s.method === method).length,
      amount: total(
        sales.filter((s) => s.method === method).map((s) => s.paid),
      ),
    }),
  );
  const creditAge = [
    { label: "0–7 days", min: 0, max: 7 },
    { label: "8–30 days", min: 8, max: 30 },
    { label: "31+ days", min: 31, max: Infinity },
  ].map((bucket) => ({
    ...bucket,
    max: Number.isFinite(bucket.max) ? bucket.max : null,
    amount: total(
      state.sales
        .filter((s) => {
          const age = Math.floor(
            (now.getTime() - new Date(s.createdAt).getTime()) / 86400000,
          );
          return age >= bucket.min && age <= bucket.max;
        })
        .map((s) => s.total - paidFor(state, s)),
    ),
  }));
  const observedDays = new Set(sales.map((s) => day(s.createdAt))).size;
  const low = state.products.filter((p) => p.stock <= p.threshold),
    negativeMargins = products.filter((p) => p.units > 0 && p.grossProfit < 0);
  const insights: Array<{
    title: string;
    body: string;
    action: string;
    page: string;
    kind: string;
  }> = [];
  if (sales.length >= 3 && previous.length >= 3 && previousRevenue > 0) {
    const change = ((revenue - previousRevenue) / previousRevenue) * 100;
    insights.push({
      title: `Sales ${change >= 0 ? "up" : "down"} ${Math.abs(change).toFixed(1)}%`,
      body: `${money(revenue)} recorded in this ${days}-day period, compared with ${money(previousRevenue)} in the previous ${days} days. This compares sales value, rather than cash received.`,
      action: "Review sales",
      page: "Sales history",
      kind: "trend",
    });
  } else
    insights.push({
      title: "Build a useful sales history",
      body: `${sales.length} sales recorded in this period. A trend comparison appears after at least three sales in each comparison period.`,
      action: "Record a sale",
      page: "Record sale",
      kind: "trend",
    });
  insights.push({
    title: low.length
      ? `${low.length} products need a stock check`
      : "Your stock alerts are clear",
    body: low.length
      ? low
          .slice(0, 3)
          .map(
            (p) => `${p.name}: ${p.stock} ${p.unit}, alert at ${p.threshold}`,
          )
          .join(" · ")
      : "Current quantities are above the alert levels you set. Keep those levels aligned with your ordering routine.",
    action: "Review stock",
    page: "Inventory",
    kind: "stock",
  });
  if (credit > 0)
    insights.push({
      title: `${money(credit)} still to collect`,
      body: "Review outstanding customer balances before extending more credit. Balance age is shown in the detailed report; it is not an overdue label because due dates are not recorded.",
      action: "Review customer balances",
      page: "Customers & credit",
      kind: "credit",
    });
  if (negativeMargins.length)
    insights.push({
      title: "Some products sold below recorded cost",
      body:
        negativeMargins
          .slice(0, 3)
          .map((p) => `${p.name}: ${money(p.grossProfit)} gross profit`)
          .join(" · ") +
        ". Check the recorded purchase costs and selling prices.",
      action: "Review product prices",
      page: "Inventory",
      kind: "margin",
    });
  return {
    asOf: now.toISOString(),
    days,
    periodStart: new Date(start).toISOString(),
    periodEnd: new Date(end).toISOString(),
    metrics: {
      revenue,
      cogs,
      grossProfit: revenue - cogs,
      collected,
      credit,
      sales: sales.length,
      averageSale: sales.length ? Math.round(revenue / sales.length) : 0,
      inventoryAtCost: total(state.products.map((p) => p.stock * p.cost)),
      grossMarginPercent: revenue ? ((revenue - cogs) / revenue) * 100 : null,
    },
    previousRevenue,
    observedDays,
    products,
    daily,
    paymentMix,
    creditAge,
    insights,
    notes: [
      "Estimated gross profit uses the cost recorded on each sale and excludes operating expenses and tax.",
      "Collections include sale payments and repayments received during the selected period.",
      "Credit balance includes all unpaid sales. Age is not a contractual overdue date.",
      "Historical imports are included; duplicate references are rejected.",
    ],
  };
}
export type AnalyticsReport = ReturnType<typeof buildAnalytics> & {
  aiSummary?: { summary: string; observations: string[]; actions: string[] };
  aiAvailable?: boolean;
};
