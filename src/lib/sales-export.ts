import { discountFor, paidFor, type State, type Sale } from "./domain.ts";
export type SalesPeriod = {
  mode: "all" | "day" | "week" | "month" | "range";
  date: string;
  end: string;
};
export const salesDay = (value: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos" }).format(
    new Date(value),
  );
function validDate(value: string) {
  const parsed = new Date(`${value}T12:00:00Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    !Number.isFinite(+parsed) ||
    parsed.toISOString().slice(0, 10) !== value
  )
    throw new Error("Choose a valid calendar date.");
  return parsed;
}
export function salesRange(
  period: SalesPeriod,
): { start: string; end: string; label: string } | null {
  if (period.mode === "all") return null;
  if (period.mode === "month") {
    if (!/^\d{4}-\d{2}$/.test(period.date)) throw new Error("Choose a month.");
    const first = validDate(`${period.date}-01`),
      last = new Date(
        Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0),
      );
    return {
      start: first.toISOString().slice(0, 10),
      end: last.toISOString().slice(0, 10),
      label: period.date,
    };
  }
  const date = validDate(period.date);
  if (period.mode === "week") {
    const monday = new Date(date);
    monday.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
    const sunday = new Date(monday);
    sunday.setUTCDate(monday.getUTCDate() + 6);
    return {
      start: monday.toISOString().slice(0, 10),
      end: sunday.toISOString().slice(0, 10),
      label: `week-${monday.toISOString().slice(0, 10)}`,
    };
  }
  const end =
    period.mode === "range"
      ? validDate(period.end).toISOString().slice(0, 10)
      : period.date;
  if (end < period.date)
    throw new Error("The end date must be on or after the start date.");
  return {
    start: period.date,
    end,
    label: period.date === end ? period.date : `${period.date}-to-${end}`,
  };
}
export function filterSales(sales: Sale[], period: SalesPeriod) {
  const range = salesRange(period);
  return range
    ? sales.filter((s) => {
        const day = salesDay(s.createdAt);
        return day >= range.start && day <= range.end;
      })
    : sales;
}
export function salesSummaryRows(state: State, sales: Sale[]): unknown[][] {
  return [
    [
      "Reference",
      "Sale date",
      "Customer",
      "Agreed sales NGN",
      "Recorded cost NGN",
      "Estimated gross profit NGN",
      "Discounts given NGN",
      "Initial payment NGN",
      "Paid to date NGN",
      "Balance to date NGN",
      "Payment method",
      "Due date",
      "Recorded by",
      "Original prices known",
    ],
    ...sales.map((s) => {
      const cost = s.lines.reduce((sum, l) => sum + l.cost * l.quantity, 0);
      return [
        s.id,
        s.createdAt,
        s.customer,
        s.total / 100,
        cost / 100,
        (s.total - cost) / 100,
        discountFor(s) / 100,
        s.paid / 100,
        paidFor(state, s) / 100,
        (s.total - paidFor(state, s)) / 100,
        s.method,
        s.dueDate || "",
        s.recordedByName || "",
        s.lines.every((l) => l.originalPrice != null)
          ? "Yes"
          : "Unknown for some historical items",
      ];
    }),
  ];
}
