"use client";
import { useEffect, useState } from "react";
import HotPlanMark from "./hot-plan-mark";
import { Check, CreditCard } from "lucide-react";
import {
  offers,
  planLimits,
  formatNaira,
  type BillingCategory,
  type OfferCode,
} from "../lib/plans";
import { authenticatedFetch } from "../lib/api-client";
import { getSupabase } from "../lib/supabase";
import useEntitlements from "./use-entitlements";
export default function SubscriptionPlans({
  businessId,
  canChoose = false,
}: {
  businessId?: string;
  canChoose?: boolean;
}) {
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
        <span className="eyebrow">COUNTIVA V2 PLANS</span>
        <h2>A plan for your next chapter.</h2>
        <p>
          Clear prices in Nigerian naira, per business. Choose your access
          period and pay upfront.
        </p>
      </div>
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
                      ? `${entitlements.tier === "growth" ? "Growth" : "Starter"} · activated by Countiva`
                      : entitlements.status === "active"
                        ? `Current plan: ${entitlements.tier === "growth" ? "Growth" : "Starter"}`
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
      <div
        className={`plan-grid v2-plan-grid ${category === "monthly" ? "three-plans" : ""}`}
      >
        {offers
          .filter((offer) => offer.category === category)
          .map((offer) => {
            const limits = planLimits[offer.tier];
            return (
              <article
                key={offer.code}
                className={`plan-card ${offer.hot ? "hot-plan" : ""}`}
              >
                <div className="plan-title">
                  <h3>{offer.name}</h3>
                  {offer.hot && (
                    <span className="hot-label">
                      <HotPlanMark />
                      Hot plan
                    </span>
                  )}
                </div>
                <p>{offer.description}</p>
                <div className="plan-price">
                  {formatNaira(offer.amount)}
                  <span>
                    {" "}
                    / {offer.months === 1 ? "month" : `${offer.months} months`}
                  </span>
                </div>
                <p className="plan-saving">
                  {offer.hot
                    ? "Save ₦75,000 against three Growth monthly payments."
                    : offer.months > 1
                      ? `${formatNaira(offer.amount / offer.months)} per month equivalent. Full amount charged upfront.`
                      : "A full month of access, paid upfront."}
                </p>
                <ul>
                  {[
                    `${limits.members === 3 ? "Owner + 2" : "Owner + 5"} additional users`,
                    `${limits.templates.length} receipt templates`,
                    `${limits.scans} scans per calendar month`,
                    `${limits.scanItems} products per photo`,
                    "CSV / Excel import and export",
                    "Stock, sales, credit and basic insights",
                  ].map((feature) => (
                    <li key={feature}>
                      <Check size={17} />
                      {feature}
                    </li>
                  ))}
                </ul>
                {businessId ? (
                  <button
                    className={`button ${offer.hot ? "hot-button" : "primary"} full`}
                    disabled={
                      !canChoose ||
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
                    Get started{" "}
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
        access already assigned to you. Detailed analytics reports cost ₦5,000
        each and are purchased separately.{" "}
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
                        "Detailed analytics report"}
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
