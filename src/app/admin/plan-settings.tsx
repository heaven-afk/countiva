"use client";
import { useEffect, useState } from "react";
import { authenticatedFetch } from "../../lib/api-client";
import { money, toKobo } from "../../lib/domain";
import type { PlatformRole } from "../../lib/contracts";
import type { PlanSettings } from "../../lib/admin-operations";
import Skeleton from "../skeleton";
import { offers } from "../../lib/plans";
export default function AdminPlanSettings({ role }: { role: PlatformRole }) {
  const [data, setData] = useState<PlanSettings | null>(null),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const editable = role === "owner" || role === "admin";
  async function load() {
    try {
      setData(
        await authenticatedFetch("/api/admin/operations", {
          action: "settings",
        }),
      );
    } catch (e) {
      setMessage((e as Error).message);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  async function save(event: React.FormEvent<HTMLFormElement>, code?: string) {
    event.preventDefault();
    if (!data || !editable) return;
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setMessage("");
    try {
      const revision = code
        ? data.plans.find((p) => p.code === code)!.revision
        : data.trial.revision;
      const result = await authenticatedFetch(
        "/api/admin/operations",
        code
          ? {
              action: "updatePlan",
              code,
              amount: toKobo(String(form.get("amount"))),
              enabled: form.has("enabled"),
              revision,
              reason: String(form.get("reason")),
            }
          : {
              action: "updateTrial",
              days: Number(form.get("days")),
              enabled: form.has("enabled"),
              revision,
              reason: String(form.get("reason")),
            },
      );
      setData(result);
      setMessage(
        "Settings saved. Existing purchases and active trials retain their agreed terms.",
      );
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel admin-operations" id="admin-plans">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">COMMERCIAL SETTINGS</span>
          <h2>Plans & new-owner trials</h2>
          <p>
            Prices apply to new checkouts. Existing paid periods and pending
            purchases keep their original amounts.
          </p>
        </div>
        <button className="button secondary" onClick={() => void load()}>
          Refresh settings
        </button>
      </div>
      {!data ? (
        <Skeleton compact label="Loading plan settings" />
      ) : (
        <div className="admin-operations-body">
          {data.promotion && (
            <p className="plans-trial-offer">
              Starter Hot Deal: {money(data.promotion.amount)} for one month,
              available until{" "}
              {new Date(data.promotion.ends_at).toLocaleString("en-NG", {
                timeZone: "Africa/Lagos",
                dateStyle: "medium",
                timeStyle: "short",
              })}{" "}
              (Lagos). The price editors below keep the standard prices. The
              discount expires automatically.
            </p>
          )}
          <div className="admin-plan-editor-grid">
            {data.plans
              .filter((p) => offers.some((offer) => offer.code === p.code))
              .map((p) => (
                <form
                  key={`${p.code}:${p.revision}`}
                  onSubmit={(e) => void save(e, p.code)}
                  className="admin-plan-editor"
                >
                  <h3>{p.name}</h3>
                  <p>
                    {p.months} {p.months === 1 ? "month" : "months"} ·{" "}
                    {money(p.amount)} total
                  </p>
                  <fieldset disabled={!editable || busy}>
                    <label>
                      Price in naira
                      <input
                        name="amount"
                        inputMode="decimal"
                        required
                        defaultValue={(p.amount / 100).toFixed(2)}
                      />
                    </label>
                    <label className="check-label">
                      <input
                        type="checkbox"
                        name="enabled"
                        defaultChecked={p.enabled}
                      />
                      Available for new purchases
                    </label>
                    <label>
                      Reason for change
                      <input
                        name="reason"
                        required
                        minLength={5}
                        maxLength={500}
                      />
                    </label>
                    <button className="button primary" type="submit">
                      Save plan
                    </button>
                  </fieldset>
                </form>
              ))}
          </div>
          <form
            key={`trial:${data.trial.revision}`}
            onSubmit={(e) => void save(e)}
            className="admin-trial-policy"
          >
            <h3>New-owner Growth trial</h3>
            <p>
              One trial per new business owner. Changing this policy affects
              future onboarding; it does not restart or shorten existing trials.
            </p>
            <fieldset disabled={!editable || busy} className="settings-form">
              <label>
                Free Growth days
                <input
                  name="days"
                  type="number"
                  min={1}
                  max={90}
                  required
                  defaultValue={data.trial.days}
                />
              </label>
              <label className="check-label">
                <input
                  type="checkbox"
                  name="enabled"
                  defaultChecked={data.trial.enabled}
                />
                Offer a free trial to new owners
              </label>
              <label>
                Reason for change
                <input name="reason" required minLength={5} maxLength={500} />
              </label>
              <button className="button primary" type="submit">
                Save trial policy
              </button>
            </fieldset>
          </form>
          <h3>Recent plan & trial changes</h3>
          {!data.audit.length ? (
            <p>No administrative changes recorded yet.</p>
          ) : (
            data.audit.map((a) => (
              <details key={a.id} className="admin-audit-entry">
                <summary>
                  {a.action.replaceAll("_", " ")} · {a.target} · {a.actor_email}
                </summary>
                <p>
                  {a.reason} ·{" "}
                  {new Date(a.created_at).toLocaleString("en-NG", {
                    timeZone: "Africa/Lagos",
                  })}
                </p>
                <pre>
                  {JSON.stringify(
                    { before: a.previous_value, after: a.next_value },
                    null,
                    2,
                  )}
                </pre>
              </details>
            ))
          )}
        </div>
      )}
      {message && (
        <p className="banner" role="status">
          {message}
        </p>
      )}
    </section>
  );
}
