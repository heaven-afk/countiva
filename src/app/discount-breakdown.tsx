"use client";
import { useState } from "react";
import { discountFor, money, type Sale, type State } from "../lib/domain";
const day = (value: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos" }).format(
    new Date(value),
  );
export default function DiscountBreakdown({
  state,
  onReceipt,
}: {
  state: State;
  onReceipt?: (sale: Sale) => void;
}) {
  const [days, setDays] = useState(1);
  const end = Date.parse(`${day(new Date().toISOString())}T23:59:59.999+01:00`),
    start = end + 1 - days * 86400000;
  const sales = state.sales.filter(
    (s) => +new Date(s.createdAt) >= start && +new Date(s.createdAt) <= end,
  );
  const discounted = sales.filter((s) => discountFor(s) > 0),
    unknown = sales.filter((s) =>
      s.lines.some((l) => l.originalPrice == null),
    ).length;
  return (
    <details className="panel discount-breakdown">
      <summary>
        {days === 1 ? "Discounts Given Today" : "Discounts given"}
        <strong>
          {money(sales.reduce((sum, s) => sum + discountFor(s), 0))}
        </strong>
        <span>View products and sale recorders</span>
      </summary>
      <div className="discount-breakdown-body">
        <label>
          Discount reporting period
          <select value={days} onChange={(e) => setDays(+e.target.value)}>
            <option value={1}>Today</option>
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
          </select>
        </label>
        <p className="form-note">
          Voluntary price reductions are separate from unpaid customer balances.
          {unknown > 0 &&
            ` Original prices are unknown for ${unknown} older/imported sales; those unknown discounts are excluded.`}
        </p>
        {!discounted.length ? (
          <p>No recorded discounts in this period.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Receipt / product</th>
                  <th>Original unit price</th>
                  <th>Agreed unit price</th>
                  <th>Discount</th>
                  <th>Recorded by</th>
                </tr>
              </thead>
              <tbody>
                {discounted.flatMap((s) =>
                  s.lines
                    .filter(
                      (l) =>
                        l.originalPrice != null && l.originalPrice > l.price,
                    )
                    .map((l, index) => (
                      <tr key={`${s.id}:${index}`}>
                        <td>
                          {onReceipt ? (
                            <button
                              className="text-button"
                              onClick={() => onReceipt(s)}
                            >
                              {s.id.slice(0, 8).toUpperCase()}
                            </button>
                          ) : (
                            s.id.slice(0, 8).toUpperCase()
                          )}
                          <small>
                            {l.name} · {l.quantity} {l.unit}
                          </small>
                        </td>
                        <td>{money(l.originalPrice!)}</td>
                        <td>{money(l.price)}</td>
                        <td>
                          {money((l.originalPrice! - l.price) * l.quantity)}
                        </td>
                        <td>{s.recordedByName || "Not recorded"}</td>
                      </tr>
                    )),
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </details>
  );
}
