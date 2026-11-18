"use client";
import type { SalesPeriod } from "../lib/sales-export";
import { salesDay, salesRange } from "../lib/sales-export";
import { filterSales } from "../lib/sales-export";
import type { Sale } from "../lib/domain";
export function defaultSalesPeriod(): SalesPeriod {
  const date = salesDay(new Date().toISOString());
  return { mode: "all", date, end: date };
}
export default function SalesExportRange({
  value,
  onChange,
  sales,
}: {
  value: SalesPeriod;
  onChange: (value: SalesPeriod) => void;
  sales?: Sale[];
}) {
  let label = "";
  let matches: number | undefined;
  try {
    const range = salesRange(value);
    if (range) label = `${range.start} to ${range.end} · Africa/Lagos`;
    if (sales) matches = filterSales(sales, value).length;
  } catch {}
  return (
    <div className="sales-export-panel">
      <div className="sales-export-fields">
        <label>
          Sales export period
          <select
            aria-label="Sales export period"
            value={value.mode}
            onChange={(e) => {
              const mode = e.target.value as SalesPeriod["mode"];
              onChange({
                ...value,
                mode,
                date:
                  mode === "month"
                    ? value.date.slice(0, 7)
                    : value.date.length === 7
                      ? `${value.date}-01`
                      : value.date,
              });
            }}
          >
            <option value="all">All saved sales</option>
            <option value="day">A particular day</option>
            <option value="week">A particular week</option>
            <option value="month">A particular month</option>
            <option value="range">Custom date range</option>
          </select>
        </label>
        {value.mode !== "all" && (
          <label>
            {value.mode === "month"
              ? "Month"
              : value.mode === "week"
                ? "Date within the week"
                : value.mode === "range"
                  ? "Start date"
                  : "Sale date"}
            <input
              type={value.mode === "month" ? "month" : "date"}
              value={value.date}
              onChange={(e) => onChange({ ...value, date: e.target.value })}
            />
          </label>
        )}
        {value.mode === "range" && (
          <label>
            End date
            <input
              type="date"
              value={value.end}
              min={value.date}
              onChange={(e) => onChange({ ...value, end: e.target.value })}
            />
          </label>
        )}
      </div>
      <p className="form-note">
        {matches !== undefined &&
          `${matches} matching ${matches === 1 ? "sale" : "sales"}. `}
        {label || "All saved sales."} Weeks run Monday–Sunday. Exports filter by
        sale date; paid-to-date and balance figures include repayments recorded
        by export time.
      </p>
    </div>
  );
}
