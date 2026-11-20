"use client";
import { useEffect, useMemo, useState } from "react";
import { authenticatedFetch } from "../../lib/api-client";
import { buildAnalytics } from "../../lib/analytics";
import { money, paidFor, type Sale } from "../../lib/domain";
import type { PlatformRole } from "../../lib/contracts";
import type { SupportWorkspace } from "../../lib/admin-operations";
import ReceiptDocument from "../receipt-document";
import DiscountBreakdown from "../discount-breakdown";
export default function AdminBusinessViewer({
  role,
  target,
}: {
  role: PlatformRole;
  target: { id: string; name: string } | null;
}) {
  const [search, setSearch] = useState(""),
    [offset, setOffset] = useState(0),
    [results, setResults] = useState<
      { id: string; name: string; owner_email: string }[]
    >([]),
    [selected, setSelected] = useState(target),
    [reason, setReason] = useState(""),
    [view, setView] = useState<SupportWorkspace | null>(null),
    [tab, setTab] = useState("Overview"),
    [receipt, setReceipt] = useState<Sale | null>(null),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [history, setHistory] = useState<
      {
        id: string;
        business_name: string;
        actor_email: string;
        reason: string;
        created_at: string;
      }[]
    >([]);
  const allowed = role === "owner" || role === "admin";
  const analysis = useMemo(
    () => (view ? buildAnalytics(view.snapshot, 30) : null),
    [view],
  );
  useEffect(() => {
    if (target) {
      setSelected(target);
      setView(null);
      setReceipt(null);
      document
        .getElementById("admin-support")
        ?.scrollIntoView({ block: "start" });
    }
  }, [target]);
  useEffect(() => {
    if (!view) return;
    const timer = setTimeout(
      () => {
        setView(null);
        setReceipt(null);
        setMessage(
          "This support view expired. Open another view with a review reason.",
        );
      },
      Math.max(0, Date.parse(view.expiresAt) - Date.now()),
    );
    const check = setInterval(() => {
      void authenticatedFetch("/api/admin/operations", { action: "access" })
        .then((data) => {
          if (!["owner", "admin"].includes(data.role)) setView(null);
        })
        .catch(() => setView(null));
    }, 60000);
    const clear = () => {
      setView(null);
      setReceipt(null);
    };
    window.addEventListener("offline", clear);
    return () => {
      clearTimeout(timer);
      clearInterval(check);
      window.removeEventListener("offline", clear);
    };
  }, [view]);
  async function find(next = 0) {
    setBusy(true);
    setMessage("");
    try {
      setResults(
        await authenticatedFetch("/api/admin/operations", {
          action: "businessSearch",
          search,
          offset: next,
        }),
      );
      setOffset(next);
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function open() {
    if (!selected) return;
    setBusy(true);
    setMessage("");
    try {
      setView(
        await authenticatedFetch("/api/admin/operations", {
          action: "inspect",
          businessId: selected.id,
          reason,
        }),
      );
      setReceipt(null);
      setTab("Overview");
      setHistory(
        await authenticatedFetch("/api/admin/operations", {
          action: "supportHistory",
        }),
      );
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel admin-operations" id="admin-support">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">PLATFORM SUPPORT</span>
          <h2>Business workspace inspection</h2>
          <p>
            Review a business using your own administrator identity. Every
            opened view records its administrator, time and reason.
          </p>
        </div>
      </div>
      <div className="admin-operations-body">
        {!allowed ? (
          <p>
            Your viewer role can monitor platform totals. Business-detail
            inspection requires an owner or administrator.
          </p>
        ) : (
          <>
            <form
              className="admin-support-search"
              onSubmit={(e) => {
                e.preventDefault();
                void find();
              }}
            >
              <label>
                Find business or owner email
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  maxLength={150}
                />
              </label>
              <button className="button secondary" disabled={busy}>
                Search businesses
              </button>
            </form>
            {!!results.length && (
              <div className="admin-business-results">
                {results.map((b) => (
                  <button
                    className="button secondary"
                    key={b.id}
                    onClick={() => {
                      setSelected(b);
                      setView(null);
                    }}
                  >
                    {b.name}
                    <small>{b.owner_email}</small>
                  </button>
                ))}
                <div>
                  <button
                    className="button secondary"
                    disabled={!offset || busy}
                    onClick={() => void find(Math.max(0, offset - 50))}
                  >
                    Previous
                  </button>
                  <button
                    className="button secondary"
                    disabled={results.length < 50 || busy}
                    onClick={() => void find(offset + 50)}
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
            {selected && (
              <form
                className="settings-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  void open();
                }}
              >
                <h3>{selected.name}</h3>
                <label>
                  Review or support reason
                  <textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    required
                    minLength={5}
                    maxLength={500}
                  />
                </label>
                <button className="button primary" disabled={busy}>
                  {busy ? "Opening…" : "Open read-only workspace"}
                </button>
              </form>
            )}
            {view && analysis && (
              <div className="admin-workspace-preview">
                <div className="admin-support-banner">
                  <div>
                    <strong>Admin support view · {view.workspace.name}</strong>
                    <p>
                      Read only · {view.subscription.tier} /{" "}
                      {view.subscription.status} · expires{" "}
                      {new Date(view.expiresAt).toLocaleTimeString("en-NG", {
                        timeZone: "Africa/Lagos",
                      })}
                    </p>
                  </div>
                  <button
                    className="button secondary"
                    onClick={() => {
                      setView(null);
                      setReceipt(null);
                    }}
                  >
                    Close support view
                  </button>
                </div>
                <nav
                  className="admin-section-nav"
                  aria-label="Inspected business sections"
                >
                  {[
                    "Overview",
                    "Inventory",
                    "Sales",
                    "Customers",
                    "Team",
                    "Business insights",
                  ].map((t) => (
                    <button
                      className="button secondary"
                      key={t}
                      onClick={() => {
                        setTab(t);
                        setReceipt(null);
                      }}
                      aria-pressed={tab === t}
                    >
                      {t}
                    </button>
                  ))}
                </nav>
                {(tab === "Overview" || tab === "Business insights") && (
                  <>
                    <div className="stats">
                      {[
                        ["Sales · last 30 days", analysis.metrics.revenue],
                        [
                          "Estimated gross profit",
                          analysis.metrics.grossProfit,
                        ],
                        ["Money collected", analysis.metrics.collected],
                        [
                          "Customer balances · all sales",
                          analysis.metrics.credit,
                        ],
                      ].map(([label, value]) => (
                        <div className="stat" key={String(label)}>
                          <span className="stat-label">{label}</span>
                          <strong className="stat-value">
                            {money(Number(value))}
                          </strong>
                        </div>
                      ))}
                    </div>
                    {analysis.insights.map((i) => (
                      <article className="admin-insight" key={i.kind}>
                        <h3>{i.title}</h3>
                        <p>{i.body}</p>
                      </article>
                    ))}
                    <DiscountBreakdown state={view.snapshot} />
                  </>
                )}
                {tab === "Inventory" && (
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Product</th>
                          <th>Stock</th>
                          <th>Cost</th>
                          <th>Selling price</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {view.snapshot.products.map((p) => (
                          <tr key={p.id}>
                            <td>
                              {p.name}
                              <small>{p.unit}</small>
                            </td>
                            <td>{p.stock}</td>
                            <td>{money(p.cost)}</td>
                            <td>{money(p.price)}</td>
                            <td>{p.archivedAt ? "Archived" : "Active"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {(tab === "Sales" || tab === "Customers") && (
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Receipt / customer</th>
                          <th>Agreed total</th>
                          <th>Paid to date</th>
                          <th>Balance</th>
                          <th>Due date</th>
                        </tr>
                      </thead>
                      <tbody>
                        {view.snapshot.sales
                          .filter(
                            (s) =>
                              tab === "Sales" ||
                              paidFor(view.snapshot, s) < s.total,
                          )
                          .map((s) => (
                            <tr key={s.id}>
                              <td>
                                <button
                                  className="text-button"
                                  onClick={() => setReceipt(s)}
                                >
                                  {s.id.slice(0, 8).toUpperCase()}
                                </button>
                                <small>
                                  {s.customer || "Walk-in customer"}
                                </small>
                              </td>
                              <td>{money(s.total)}</td>
                              <td>{money(paidFor(view.snapshot, s))}</td>
                              <td>
                                {money(s.total - paidFor(view.snapshot, s))}
                              </td>
                              <td>{s.dueDate || "Not set"}</td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {tab === "Team" &&
                  view.team.map((m) => (
                    <p key={m.email}>
                      {m.email} · {m.role}
                    </p>
                  ))}
                {receipt && (
                  <div className="admin-receipt-preview">
                    <button
                      className="button secondary"
                      onClick={() => setReceipt(null)}
                    >
                      Close receipt preview
                    </button>
                    <ReceiptDocument
                      sale={receipt}
                      state={view.snapshot}
                      workspace={view.workspace}
                    />
                  </div>
                )}
              </div>
            )}
            {!!history.length && (
              <details className="admin-support-history">
                <summary>Recent business inspection log</summary>
                {history.map((h) => (
                  <p key={h.id}>
                    <strong>{h.business_name}</strong> · {h.actor_email} ·{" "}
                    {new Date(h.created_at).toLocaleString("en-NG", {
                      timeZone: "Africa/Lagos",
                    })}
                    <br />
                    {h.reason}
                  </p>
                ))}
              </details>
            )}
          </>
        )}
        {message && (
          <p className="banner" role="status">
            {message}
          </p>
        )}
      </div>
    </section>
  );
}
