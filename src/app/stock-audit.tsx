"use client";
import { useState } from "react";
import { getSupabase } from "../lib/supabase";
import { money } from "../lib/domain";
import type { StockAuditEntry } from "../lib/stock-management";
import Skeleton from "./skeleton";

const actionLabels = {
  created: "Product added",
  edited: "Product edited",
  deleted: "Product deleted",
  adjusted: "Stock adjusted",
};
const fields = [
  ["name", "Name"],
  ["category", "Category"],
  ["unit", "Unit"],
  ["cost", "Cost"],
  ["price", "Selling price"],
  ["threshold", "Low-stock threshold"],
] as const;

export default function StockAudit({ businessId }: { businessId: string }) {
  const [entries, setEntries] = useState<StockAuditEntry[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [more, setMore] = useState(false);
  const [error, setError] = useState("");

  async function load(before?: number) {
    const client = getSupabase();
    if (!client || busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await client.rpc("list_stock_audit", {
        bid: businessId,
        before_id: before,
      });
      if (result.error) throw result.error;
      setEntries((current) =>
        before === undefined
          ? result.data
          : [...(current || []), ...result.data],
      );
      setMore(result.data.length === 30);
    } catch {
      setEntries(null);
      setError(
        "Couldn’t load stock logs. Check your connection and try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel stock-audit" aria-labelledby="stock-audit-title">
      <div className="panel-heading">
        <div>
          <h2 id="stock-audit-title">Stock activity log</h2>
          <p>See who added, edited, adjusted or deleted stock.</p>
        </div>
        <button
          type="button"
          className="button secondary"
          onClick={() => void load()}
          disabled={busy}
        >
          {entries ? "Refresh logs" : "View logs"}
        </button>
      </div>
      {error && (
        <p className="banner" role="alert">
          {error}
        </p>
      )}
      {busy && !entries && <Skeleton compact label="Loading stock logs" />}
      {entries && (
        <div className="stock-audit-entries">
          {!entries.length && <p>No stock changes have been logged yet.</p>}
          {entries.map((entry) => (
            <article key={entry.id} className="stock-audit-entry">
              <div>
                <strong>{entry.product_name}</strong>
                <span className="badge">{actionLabels[entry.action]}</span>
              </div>
              <p>
                {entry.actor_email || "System"} ·{" "}
                <time dateTime={entry.created_at}>
                  {new Date(entry.created_at).toLocaleString("en-NG", {
                    timeZone: "Africa/Lagos",
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </time>
              </p>
              {entry.action === "adjusted" && (
                <p>
                  {(entry.after_details?.quantity ?? 0) > 0 ? "+" : ""}
                  {entry.after_details?.quantity} ·{" "}
                  {entry.after_details?.reason}
                </p>
              )}
              {entry.action === "edited" && (
                <ul>
                  {fields.map(([key, label]) => {
                    const before = entry.before_details?.[key],
                      after = entry.after_details?.[key];
                    if (before === after) return null;
                    const format = (value: string | number | undefined) =>
                      typeof value === "number" &&
                      (key === "price" || key === "cost")
                        ? money(value)
                        : value;
                    return (
                      <li key={key}>
                        {label}: {format(before)} → {format(after)}
                      </li>
                    );
                  })}
                </ul>
              )}
            </article>
          ))}
          {more && (
            <button
              type="button"
              className="button secondary"
              disabled={busy}
              onClick={() => void load(entries.at(-1)?.id)}
            >
              {busy ? "Loading…" : "Load older logs"}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
