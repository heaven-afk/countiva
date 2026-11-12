"use client";
import { useEffect, useRef, useState } from "react";
import {
  CreditCard,
  Gift,
  Pause,
  Play,
  RefreshCw,
  Search,
  ShieldCheck,
} from "lucide-react";
import { getSupabase } from "../../lib/supabase";
import { money } from "../../lib/domain";
import { offers } from "../../lib/plans";
import type { PlatformRole } from "../../lib/contracts";
import type {
  AdminSubscription,
  SubscriptionAction,
  SubscriptionHistory,
  SubscriptionPage,
} from "../../lib/admin-subscriptions";
import Skeleton from "../skeleton";

const stamp = (value: string | null | undefined) =>
  value
    ? new Date(value).toLocaleString("en-NG", {
        timeZone: "Africa/Lagos",
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "—";
const expiryInput = (days: number) =>
  new Date(Date.now() + days * 86400000 + 3600000).toISOString().slice(0, 16);
const actionLabels: Record<SubscriptionAction, string> = {
  pause: "Pause access",
  resume: "Resume current access",
  trial: "Grant free Growth trial",
  activate: "Activate access manually",
  end_grant: "End trial / manual activation",
};
export default function AdminSubscriptions({
  role,
  onChanged,
}: {
  role: PlatformRole;
  onChanged: () => void;
}) {
  const [page, setPage] = useState<SubscriptionPage | null>(null),
    [searchInput, setSearchInput] = useState(""),
    [search, setSearch] = useState(""),
    [filter, setFilter] = useState("all"),
    [offset, setOffset] = useState(0),
    [refresh, setRefresh] = useState(0),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const [selected, setSelected] = useState<AdminSubscription | null>(null),
    [history, setHistory] = useState<SubscriptionHistory | null>(null),
    [historyError, setHistoryError] = useState(""),
    [action, setAction] = useState<SubscriptionAction>("trial"),
    [tier, setTier] = useState("growth"),
    [expiresAt, setExpiresAt] = useState(""),
    [reason, setReason] = useState(""),
    [saving, setSaving] = useState(false),
    [message, setMessage] = useState("");
  const requestId = useRef(""),
    version = useRef(0),
    historyVersion = useRef(0);
  const canManage = role === "owner" || role === "admin";
  useEffect(() => {
    let alive = true;
    const revision = ++version.current;
    setLoading(true);
    setError("");
    const client = getSupabase();
    if (!client) {
      setLoading(false);
      setError("Account services are unavailable.");
      return;
    }
    client
      .rpc("platform_subscriptions", {
        search_text: search,
        status_filter: filter,
        offset_rows: offset,
        page_size: 25,
      })
      .then(({ data, error }) => {
        if (!alive || revision !== version.current) return;
        if (error) {
          setPage(null);
          setError(
            "Subscription management is unavailable. Apply migration 007 and check platform access. " +
              error.message,
          );
        } else setPage(data);
        setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [search, filter, offset, refresh]);
  useEffect(() => {
    const update = () => setRefresh((current) => current + 1);
    const timer = setInterval(update, 60000);
    window.addEventListener("focus", update);
    window.addEventListener("online", update);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", update);
      window.removeEventListener("online", update);
    };
  }, []);
  useEffect(
    () => () => {
      historyVersion.current++;
    },
    [],
  );
  async function loadHistory(bid: string) {
    const revision = ++historyVersion.current;
    setHistory(null);
    setHistoryError("");
    const result = await getSupabase()!.rpc("platform_subscription_history", {
      bid,
    });
    if (revision !== historyVersion.current) return;
    if (result.error)
      setHistoryError("History could not be loaded. " + result.error.message);
    else setHistory(result.data);
  }
  function choose(business: AdminSubscription) {
    if (saving) return;
    setSelected(business);
    setMessage("");
    setReason("");
    setTier(business.access.tier);
    setExpiresAt(expiryInput(14));
    setAction(
      business.access.status === "paused"
        ? "resume"
        : business.access.hasAccess
          ? "pause"
          : "trial",
    );
    requestId.current = crypto.randomUUID();
    void loadHistory(business.id);
  }
  function edited() {
    requestId.current = crypto.randomUUID();
    setMessage("");
  }
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || saving || !canManage) return;
    setSaving(true);
    setMessage("");
    try {
      const details: {
        requestId: string;
        reason: string;
        tier?: string;
        expiresAt?: string;
      } = {
        requestId: requestId.current || crypto.randomUUID(),
        reason: reason.trim(),
      };
      if (action === "trial" || action === "activate") {
        details.tier = action === "trial" ? "growth" : tier;
        details.expiresAt = new Date(expiresAt + ":00+01:00").toISOString();
      }
      const result = await getSupabase()!.rpc("platform_manage_subscription", {
        bid: selected.id,
        action_name: action,
        details,
      });
      if (result.error) throw result.error;
      setSelected({ ...selected, access: result.data });
      setMessage(actionLabels[action] + " saved for " + selected.name + ".");
      setRefresh((value) => value + 1);
      void loadHistory(selected.id);
      onChanged();
      requestId.current = crypto.randomUUID();
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setSaving(false);
    }
  }
  return (
    <section
      id="admin-subscriptions"
      className="panel admin-subscriptions"
      aria-labelledby="subscription-management-heading"
    >
      <div className="panel-heading">
        <div>
          <span className="eyebrow">BUSINESS ACCESS & BILLING</span>
          <h2 id="subscription-management-heading">
            <CreditCard size={21} />
            Subscription management
          </h2>
          <p>
            Monitor paid access, free Growth trials and paused businesses.{" "}
            {canManage
              ? "Each change records your account, time and reason."
              : "Your viewer role can monitor subscriptions and history."}
          </p>
        </div>
        <button
          className="button secondary"
          disabled={loading || saving}
          onClick={() => setRefresh((v) => v + 1)}
        >
          <RefreshCw size={16} />
          Refresh subscriptions
        </button>
      </div>
      <form
        className="admin-subscription-search"
        onSubmit={(e) => {
          e.preventDefault();
          setSearch(searchInput.trim());
          setOffset(0);
          setSelected(null);
        }}
      >
        <label>
          Find a business
          <div className="search">
            <Search size={17} />
            <input
              type="search"
              value={searchInput}
              maxLength={200}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Business name, owner email or business ID"
            />
          </div>
        </label>
        <label>
          Access status
          <select
            value={filter}
            onChange={(e) => {
              setFilter(e.target.value);
              setOffset(0);
              setSelected(null);
            }}
          >
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="trial">Free trial</option>
            <option value="paused">Paused</option>
            <option value="inactive">Inactive / expired</option>
            <option value="legacy">Legacy access</option>
          </select>
        </label>
        <button className="button secondary" disabled={saving}>
          Search
        </button>
      </form>
      {error && (
        <p className="banner" role="alert">
          {error}
        </p>
      )}
      {loading && !page ? (
        <Skeleton compact label="Loading business subscriptions" />
      ) : (
        page && (
          <>
            <div className="table-wrap" aria-busy={loading}>
              <table className="admin-responsive-table">
                <thead>
                  <tr>
                    <th>Business / owner</th>
                    <th>Plan & source</th>
                    <th>Status</th>
                    <th>Access ends</th>
                    <th>Team</th>
                    <th>Last verified subscription payment</th>
                    <th>Manage</th>
                  </tr>
                </thead>
                <tbody>
                  {page.businesses.map((b) => (
                    <tr key={b.id}>
                      <td data-label="Business / owner">
                        <strong>{b.name}</strong>
                        <small>{b.ownerEmail}</small>
                      </td>
                      <td data-label="Plan & source">
                        <strong>
                          {b.access.source === "none"
                            ? "No active plan"
                            : b.access.tier === "growth"
                              ? "Growth"
                              : "Starter"}
                          {b.access.source === "trial" ? " · free trial" : ""}
                        </strong>
                        <small>
                          {b.access.source === "payment"
                            ? "Verified Bachs payment"
                            : b.access.source === "manual"
                              ? "Admin activation · no payment recorded"
                              : b.access.source === "trial"
                                ? "₦0 · full Growth subscription features"
                                : b.access.source === "legacy"
                                  ? "Migration access"
                                  : "No current access"}
                        </small>
                        {b.access.nextStartsAt && (
                          <small>
                            Next:{" "}
                            {offers.find((o) => o.code === b.access.nextOffer)
                              ?.name || b.access.nextOffer}{" "}
                            · {stamp(b.access.nextStartsAt)}
                          </small>
                        )}
                      </td>
                      <td data-label="Status">
                        <span
                          className={
                            "subscription-status status-" + b.access.status
                          }
                        >
                          {b.access.status === "trial"
                            ? "Free trial"
                            : b.access.status}
                        </span>
                      </td>
                      <td data-label="Access ends">
                        {stamp(b.access.expiresAt)}
                        {b.access.pausedAt && (
                          <small>Paused {stamp(b.access.pausedAt)}</small>
                        )}
                      </td>
                      <td data-label="Team">
                        {b.members} / {b.access.maxMembers}
                      </td>
                      <td data-label="Last verified payment">
                        {b.lastPayment ? (
                          <>
                            <strong>{money(b.lastPayment.amount)}</strong>
                            <small>{stamp(b.lastPayment.paidAt)}</small>
                          </>
                        ) : (
                          "No verified payment"
                        )}
                      </td>
                      <td data-label="Manage">
                        <button
                          className="button secondary"
                          disabled={saving}
                          onClick={() => choose(b)}
                        >
                          {canManage ? "Manage" : "View history"}
                        </button>
                      </td>
                    </tr>
                  ))}
                  {!page.businesses.length && (
                    <tr>
                      <td colSpan={7}>No businesses match this search.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="admin-subscription-pagination">
              <button
                className="button secondary"
                disabled={!offset || loading || saving}
                onClick={() => {
                  setOffset(Math.max(0, offset - 25));
                  setSelected(null);
                }}
              >
                Previous
              </button>
              <span>
                {page.total ? offset + 1 : 0}–
                {Math.min(offset + 25, page.total)} of {page.total} businesses
              </span>
              <button
                className="button secondary"
                disabled={offset + 25 >= page.total || loading || saving}
                onClick={() => {
                  setOffset(offset + 25);
                  setSelected(null);
                }}
              >
                Next
              </button>
            </div>
          </>
        )
      )}
      {selected && (
        <div className="subscription-management-detail">
          <div className="panel-heading">
            <div>
              <h3>{selected.name}</h3>
              <p>{selected.ownerEmail}</p>
              <small>Business ID: {selected.id}</small>
            </div>
            <button
              className="button secondary"
              disabled={saving}
              onClick={() => {
                historyVersion.current++;
                setSelected(null);
              }}
            >
              Close details
            </button>
          </div>
          {canManage && (
            <form className="subscription-management-form" onSubmit={submit}>
              <fieldset disabled={saving}>
                <legend>
                  <ShieldCheck size={17} />
                  Manage this business
                </legend>
                <div className="admin-action-fields">
                  <label>
                    Action
                    <select
                      value={action}
                      onChange={(e) => {
                        setAction(e.target.value as SubscriptionAction);
                        edited();
                      }}
                    >
                      {Object.entries(actionLabels).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                  {action === "activate" && (
                    <label>
                      Subscription features
                      <select
                        value={tier}
                        onChange={(e) => {
                          setTier(e.target.value);
                          edited();
                        }}
                      >
                        <option value="starter">
                          Starter · owner + 2 users
                        </option>
                        <option value="growth">Growth · owner + 5 users</option>
                      </select>
                    </label>
                  )}
                  {(action === "trial" || action === "activate") && (
                    <label>
                      Access ends · Africa/Lagos
                      <input
                        type="datetime-local"
                        required
                        value={expiresAt}
                        onChange={(e) => {
                          setExpiresAt(e.target.value);
                          edited();
                        }}
                      />
                    </label>
                  )}
                </div>
                {action === "trial" && (
                  <div className="admin-trial-explanation">
                    <Gift size={20} />
                    <p>
                      <strong>Free Growth trial · ₦0</strong>Owner + 5 users, 4
                      receipt templates, 100 scans per calendar month and 40
                      products per photo. Normal Growth tools are included;
                      separately purchased detailed reports still cost ₦5,000.{" "}
                      Current members receive a one-time in-app account
                      notification.
                    </p>
                  </div>
                )}
                {action === "pause" && (
                  <p className="form-note">
                    New stock, sales, invitations, scans and reminders stop.
                    Records remain available to view and export. Paid and trial
                    expiry dates keep running; this does not freeze or extend a
                    billing period.
                  </p>
                )}
                {action === "resume" && (
                  <p className="form-note">
                    Restores the current, unexpired paid, trial or manually
                    activated access. If it has expired, activate a new period
                    or grant a trial.
                  </p>
                )}
                {action === "activate" && (
                  <p className="form-note">
                    Grants the selected features until this date. This does not
                    charge the owner or mark an invoice as paid. Record an
                    external payment reference in your reason where applicable.
                  </p>
                )}
                {(action === "activate" || action === "trial") && (
                  <p className="form-note">
                    This replaces any previous admin grant and legacy free
                    access. Existing verified paid terms are retained and their
                    expiry dates continue.
                  </p>
                )}
                {action === "end_grant" && (
                  <p className="form-note">
                    Ends only the current trial or admin activation. Any valid
                    paid subscription remains available. A separate pause
                    remains in force. Scheduled paid periods keep their original
                    start dates.
                  </p>
                )}
                <label>
                  Reason / reference
                  <textarea
                    required
                    minLength={5}
                    maxLength={500}
                    rows={3}
                    value={reason}
                    onChange={(e) => {
                      setReason(e.target.value);
                      edited();
                    }}
                    placeholder="For example: agreed 14-day onboarding trial"
                  />
                </label>
                <button className="button primary" type="submit">
                  {saving ? "Saving change…" : actionLabels[action]}
                </button>
              </fieldset>
            </form>
          )}
          {message && (
            <p className="banner" role="status">
              {message}
            </p>
          )}
          <div className="subscription-history">
            <h3>Access history</h3>
            {historyError ? (
              <p className="banner" role="alert">
                {historyError}
              </p>
            ) : !history ? (
              <Skeleton compact label="Loading subscription history" />
            ) : (
              <>
                {history.events.length ? (
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>When</th>
                          <th>Change</th>
                          <th>Administrator</th>
                          <th>Reason / reference</th>
                          <th>Resulting expiry</th>
                        </tr>
                      </thead>
                      <tbody>
                        {history.events.map((e) => (
                          <tr key={e.id}>
                            <td>{stamp(e.createdAt)}</td>
                            <td>{actionLabels[e.action]}</td>
                            <td>{e.actorEmail}</td>
                            <td>{e.reason}</td>
                            <td>{stamp(e.expiresAt)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p>No administrator changes recorded.</p>
                )}
                <h3>Billing history</h3>
                <p className="form-note">
                  Latest 30 orders. Only verified paid orders count as payments;
                  free trials and admin activations are listed above.
                </p>
                {history.orders.length ? (
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th>Order</th>
                          <th>Amount</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {history.orders.map((o) => (
                          <tr key={o.id}>
                            <td>{stamp(o.paidAt || o.createdAt)}</td>
                            <td>
                              {offers.find(
                                (offer) => offer.code === o.offerCode,
                              )?.name || "Detailed analytics report"}
                            </td>
                            <td>{money(o.amount)}</td>
                            <td>{o.status}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p>No billing orders recorded.</p>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
