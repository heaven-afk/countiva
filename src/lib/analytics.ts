import { money, paidFor, discountFor, type State } from "./domain.ts";
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
export function buildAnalytics(
  state: State,
  days = 30,
  now = new Date(),
  periodEnd?: string,
) {
  if (!Number.isInteger(days) || days < 1 || days > 92)
    throw new Error("Choose a reporting period between 1 and 92 days.");
  const end = Date.parse(
      `${day(periodEnd || now.toISOString())}T23:59:59.999+01:00`,
    ),
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
        archived: !!product.archivedAt,
        inventoryAtCost: product.archivedAt ? 0 : product.stock * product.cost,
        marginPercent: value ? ((value - cost) / value) * 100 : null,
        estimatedStockDays:
          units > 0 && !product.archivedAt
            ? Math.round((product.stock / units) * days * 10) / 10
            : null,
        units,
        revenue: value,
        cost,
        grossProfit: value - cost,
        discountsGiven: total(
          lines.map((l) =>
            l.originalPrice == null
              ? 0
              : Math.max(0, l.originalPrice - l.price) * l.quantity,
          ),
        ),
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
      discountsGiven: total(entries.map(discountFor)),
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
  const activeProducts = state.products.filter((p) => !p.archivedAt);
  const low = activeProducts.filter((p) => p.stock <= p.threshold),
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
      body: "Review outstanding customer balances before extending more credit. Balance age measures time since the sale; compare recorded due dates before treating a payment as overdue.",
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
  const idleProducts = products.filter(
    (p) => !p.archived && p.stock > 0 && p.units === 0,
  );
  const profitLeaders = [...products]
    .filter((p) => p.units > 0)
    .sort((a, b) => b.grossProfit - a.grossProfit);
  const initialCollections = total(sales.map((s) => s.paid));
  const actionPlan: Array<{
    priority: string;
    title: string;
    evidence: string;
    steps: string;
    page: string;
  }> = [];
  if (negativeMargins.length)
    actionPlan.push({
      priority: "High",
      title: "Review sales below recorded cost",
      evidence: `${negativeMargins.length} products recorded a combined ${money(total(negativeMargins.map((p) => p.grossProfit)))} gross profit in this period.`,
      steps:
        "Check each sale’s recorded cost and selling price. Confirm supplier costs before setting the next selling price; keep historical transactions intact.",
      page: "Sales history",
    });
  if (credit > 0)
    actionPlan.push({
      priority: "High",
      title: "Make a collection plan",
      evidence: `${money(credit)} remains unpaid across all saved sales; ${money(creditAge[2].amount)} relates to sales at least 31 days old.`,
      steps:
        "Review customer balances, agree payment dates and record repayments against the original sale. Balance age alone does not establish that payment is overdue.",
      page: "Customers & credit",
    });
  if (low.length)
    actionPlan.push({
      priority: "Review",
      title: "Prioritise replenishment",
      evidence: `${low.length} active products are at or below their configured stock alert level.`,
      steps:
        "Check recent demand and supplier lead times before ordering. Start with products that sold in this period, then check whether each alert threshold is still appropriate.",
      page: "Inventory",
    });
  if (idleProducts.length)
    actionPlan.push({
      priority: "Review",
      title: "Review cash tied up in unsold stock",
      evidence: `${money(total(idleProducts.map((p) => p.inventoryAtCost)))} at recorded cost is held in ${idleProducts.length} products with no sales in the selected ${days} days.`,
      steps:
        "Check stock counts and missing sales records first. Consider product visibility, smaller future orders or a margin-conscious promotion; no sales in this period does not prove an item is obsolete.",
      page: "Inventory",
    });
  if (profitLeaders[0]?.grossProfit > 0)
    actionPlan.push({
      priority: "Opportunity",
      title: "Protect your strongest profit contributor",
      evidence: `${profitLeaders[0].name} contributed ${money(profitLeaders[0].grossProfit)} in recorded gross profit from ${profitLeaders[0].units} ${profitLeaders[0].unit}.`,
      steps:
        "Check availability and supplier reliability. Compare its margin with other products before increasing purchasing; past sales do not guarantee future demand.",
      page: "Inventory",
    });
  if (!actionPlan.length)
    actionPlan.push({
      priority: "Next step",
      title: "Build a reliable operating picture",
      evidence: `${sales.length} sales and ${observedDays} days with sales are recorded in this period.`,
      steps:
        "Record stock costs, every sale and customer repayments consistently. More complete records improve the usefulness of this analysis.",
      page: "Record sale",
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
      inventoryAtCost: total(activeProducts.map((p) => p.stock * p.cost)),
      grossMarginPercent: revenue ? ((revenue - cogs) / revenue) * 100 : null,
      discountsGiven: total(sales.map(discountFor)),
    },
    previousRevenue,
    observedDays,
    unknownDiscountSales: sales.filter((s) =>
      s.lines.some((l) => l.originalPrice == null),
    ).length,
    products,
    daily,
    paymentMix,
    creditAge,
    insights,
    intelligence: {
      revenueChangePercent:
        previousRevenue > 0 && sales.length >= 3 && previous.length >= 3
          ? ((revenue - previousRevenue) / previousRevenue) * 100
          : null,
      initialCollectionPercent:
        revenue > 0 ? (initialCollections / revenue) * 100 : null,
      repaymentsCollected: total(repayments.map((p) => p.amount)),
      idleInventoryAtCost: total(idleProducts.map((p) => p.inventoryAtCost)),
      idleProducts: idleProducts.length,
      actionPlan,
    },
    notes: [
      "Estimated gross profit uses the cost recorded on each sale and excludes operating expenses and tax.",
      "Collections include sale payments and repayments received during the selected period.",
      "Credit balance includes all unpaid sales. Age is not a contractual overdue date.",
      "Historical imports are included; duplicate references are rejected.",
      "Stock cover estimates use average units sold per calendar day in the selected period, including days without recorded sales. They are not demand forecasts.",
      "Discounts use original and agreed prices recorded on each transaction. Unknown historical discounts are excluded, never inferred from today’s product prices.",
    ],
  };
}
export type AnalyticsReport = Omit<
  ReturnType<typeof buildAnalytics>,
  "intelligence"
> & {
  intelligence?: ReturnType<typeof buildAnalytics>["intelligence"];
  aiSummary?: {
    summary: string;
    observations: string[];
    actions: string[];
  } | null;
  aiAvailable?: boolean;
  aiError?: string;
  analysisLevel?: "growth" | "business";
};
