"use client";
import { useEffect, useState } from "react";
import { Check, CreditCard, LockKeyhole } from "lucide-react";
import {
  planLimits,
  planName,
  formatNaira,
  type BillingCategory,
  type OfferCode,
} from "../lib/plans";
import { authenticatedFetch } from "../lib/api-client";
import { getSupabase } from "../lib/supabase";
import useEntitlements from "./use-entitlements";
import usePlanCatalog from "./use-plan-catalog";
export default function SubscriptionPlans({
  businessId,
  canChoose = false,
}: {
  businessId?: string;
  canChoose?: boolean;
}) {
  const { offers, trial, live, catalogError } = usePlanCatalog();
  const [category, setCategory] = useState<BillingCategory>("monthly"),
    [busy, setBusy] = useState<OfferCode | null>(null),
    [message, setMessage] = useState(""),
    [history, setHistory] = useState<
      Array<{
        id: string;
        offer_code: string;
        amount: number;
        status: string;
        created_at: string;
      }>
    >([]);
  const { entitlements, error, reload } = useEntitlements(businessId);
  useEffect(() => {
    if (!businessId || !canChoose) return;
    getSupabase()
      ?.rpc("business_billing_history", { bid: businessId })
      .then(({ data }) => {
        if (data) setHistory(data);
      });
  }, [businessId, canChoose, entitlements?.expiresAt]);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requested = offers.find((o) => o.code === params.get("plan"));
    if (requested) setCategory(requested.category);
    if (!businessId) return;
    if (params.has("checkout_id") || params.get("billing") === "returned") {
      setMessage(
        "Your payment is being verified. Access updates only after Bachs confirms it.",
      );
      let attempts = 0;
      const timer = setInterval(() => {
        void reload();
        if (++attempts >= 12) clearInterval(timer);
      }, 5000);
      return () => clearInterval(timer);
    }
  }, [businessId, reload]);
  async function checkout(code: OfferCode) {
    if (!businessId || !canChoose) return;
    setBusy(code);
    setMessage("");
    try {
      const result = await authenticatedFetch("/api/billing/checkout", {
        businessId,
        offerCode: code,
        expectedAmount: Math.round(
          offers.find((o) => o.code === code)!.amount * 100,
        ),
      });
      window.location.assign(result.url);
    } catch (e) {
      setMessage((e as Error).message);
      setBusy(null);
    }
  }
  return (
    <section className="subscription-section" aria-labelledby="plans-heading">
      <div className="plans-intro">
        <span className="eyebrow">COUNTIVA PLANS</span>
        <h2 id="plans-heading">A plan for your next chapter.</h2>
        <p>
          Clear prices in Nigerian naira, per business. Choose your access
          period and pay upfront.
        </p>
      </div>
      {live && trial.enabled && (
        <p className="plans-trial-offer">
          New business owners get {trial.days} days of Growth free. No upfront
          payment or automatic charge. Choose a paid plan when the trial ends.
        </p>
      )}
      {catalogError && (
        <p className="banner" role="status">
          {catalogError}
        </p>
      )}
      {businessId && (
        <div className="plan-summary">
          <CreditCard size={22} />
          <div>
            <strong>
              {entitlements
                ? entitlements.status === "paused"
                  ? "Subscription paused"
                  : entitlements.status === "trial"
                    ? "Free Growth trial · ₦0"
                    : entitlements.source === "manual"
                      ? `${planName(entitlements.tier)} · activated by Countiva`
                      : entitlements.status === "active"
                        ? `Current plan: ${planName(entitlements.tier)}`
                        : entitlements.status === "legacy"
                          ? "Existing workspace access"
                          : "Choose a plan to activate your business"
                : "Loading your subscription…"}
            </strong>
            {entitlements?.status === "paused" && (
              <p>
                Contact Countiva support to resume access. Existing records can
                still be viewed and exported. Checkout is unavailable while
                paused.
              </p>
            )}
            {entitlements?.status === "trial" && (
              <p>
                Your trial includes normal Growth subscription features at no
                charge until the date below. No automatic payment is taken.
              </p>
            )}
            {entitlements?.expiresAt && (
              <p>
                Current access ends{" "}
                {new Date(entitlements.expiresAt).toLocaleDateString("en-NG", {
                  timeZone: "Africa/Lagos",
                  dateStyle: "long",
                })}
                .
              </p>
            )}
            {entitlements?.nextStartsAt && (
              <p>
                Next plan:{" "}
                {offers.find((o) => o.code === entitlements.nextOffer)?.name} ·
                starts{" "}
                {new Date(entitlements.nextStartsAt).toLocaleDateString(
                  "en-NG",
                  { dateStyle: "long", timeZone: "Africa/Lagos" },
                )}
                .
              </p>
            )}
            {entitlements && (
              <small>
                {entitlements.scansUsed}/{entitlements.scanLimit} scans used
                this calendar month · up to {entitlements.scanItems} products
                per photo
              </small>
            )}
          </div>
          <button className="button secondary" onClick={() => void reload()}>
            Refresh status
          </button>
        </div>
      )}
      <div
        className="billing-periods"
        role="group"
        aria-label="Billing category"
      >
        {(["monthly", "annual"] as const).map((value) => (
          <button
            key={value}
            aria-pressed={category === value}
            onClick={() => setCategory(value)}
          >
            {value === "monthly" ? "Monthly" : "Annual"}
          </button>
        ))}
      </div>
      <div className="plan-grid v2-plan-grid three-plans">
        {offers
          .filter((offer) => offer.category === category && offer.enabled)
          .map((offer) => {
            const limits = planLimits[offer.tier];
            return (
              <article
                key={offer.code}
                className={`plan-card ${offer.tier === "growth" ? "recommended-plan" : ""}`}
              >
                <div className="plan-title">
                  <h3>{offer.name}</h3>
                  {offer.tier === "growth" && (
                    <span className="eyebrow">For growing teams</span>
                  )}
                </div>
                <p>{offer.description}</p>
                <div className="plan-price">
                  {formatNaira(offer.amount)}
                  <span> / {offer.months === 1 ? "month" : "year"}</span>
                </div>
                <p className="plan-saving">
                  {offer.months > 1
                    ? `${formatNaira(offer.amount / offer.months)} per month equivalent. ${Math.round((1 - offer.amount / ((offers.find((o) => o.tier === offer.tier && o.months === 1)?.amount || offer.amount / 12) * 12)) * 100)}% less than 12 monthly payments. Billed annually.`
                    : "A full month of access, paid upfront."}
                </p>
                <ul>
                  {[
                    limits.members === 1
                      ? "Owner only · no staff accounts"
                      : `Owner + ${limits.members - 1} staff accounts`,
                    `${limits.templates.length} receipt templates`,
                    `${limits.scans} scans per calendar month`,
                    `${limits.scanItems} products per photo`,
                    "CSV / Excel import and export",
                    "Inventory, sales and customer credit",
                    offer.tier === "starter"
                      ? "Business insights not included"
                      : offer.tier === "growth"
                        ? "Business insights and standard reports (up to 30 days)"
                        : "Advanced business analysis and 90-day reports",
                  ].map((feature) => (
                    <li key={feature}>
                      {feature === "Business insights not included" ? (
                        <LockKeyhole size={17} />
                      ) : (
                        <Check size={17} />
                      )}
                      {feature}
                    </li>
                  ))}
                </ul>
                {businessId ? (
                  <button
                    className={`button ${offer.hot ? "hot-button" : "primary"} full`}
                    disabled={
                      !canChoose ||
                      !live ||
                      busy !== null ||
                      !entitlements ||
                      entitlements.status === "paused"
                    }
                    onClick={() => void checkout(offer.code)}
                  >
                    {busy === offer.code
                      ? "Opening secure checkout…"
                      : entitlements?.status === "paused"
                        ? "Subscription paused"
                        : entitlements?.status === "active"
                          ? "Renew / choose next plan"
                          : "Continue to checkout"}
                  </button>
                ) : (
                  <a
                    className={`button ${offer.hot ? "hot-button" : "primary"} full`}
                    href={`/signup?plan=${offer.code}`}
                  >
                    {live && trial.enabled
                      ? `Start ${trial.days}-day free trial`
                      : "Get started"}{" "}
                    <span className="sr-only">with {offer.name}</span>
                  </a>
                )}
              </article>
            );
          })}
      </div>
      {(message || error) && (
        <p className="banner" role="status">
          {message || error}
        </p>
      )}
      <p className="plans-disclosure">
        Renew manually when your access period ends. Plan changes take effect
        after your current paid or administrator-granted period; you keep the
        access already assigned to you. Business insights are included in
        Growth. Business adds advanced analysis, product margins, stock
        efficiency and 90-day reporting. Starter does not include business
        insights.{" "}
        {businessId &&
          !canChoose &&
          "Only the business owner can purchase or change plans."}
      </p>
      {history.length > 0 && (
        <section className="panel billing-history">
          <div className="panel-heading">
            <h2>Billing history</h2>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Purchase</th>
                  <th>Amount</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {history.map((order) => (
                  <tr key={order.id}>
                    <td>
                      {new Date(order.created_at).toLocaleDateString("en-NG")}
                    </td>
                    <td>
                      {offers.find((o) => o.code === order.offer_code)?.name ||
                        order.offer_code}
                    </td>
                    <td>{formatNaira(order.amount / 100)}</td>
                    <td>
                      <span
                        className={`badge ${order.status === "paid" ? "green" : ""}`}
                      >
                        {order.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </section>
  );
}
