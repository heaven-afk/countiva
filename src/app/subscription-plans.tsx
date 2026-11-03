"use client";

import { useEffect, useState } from "react";
import { Check, CreditCard } from "lucide-react";

const periods = [
  { id: "monthly", label: "Monthly", months: 1 },
  { id: "quarterly", label: "3 months", months: 3 },
  { id: "yearly", label: "Yearly", months: 12 },
] as const;
const plans = [
  {
    id: "starter",
    name: "Starter",
    description: "A simple start for your everyday shop records.",
    monthly: 1500,
    quarterly: 4000,
    yearly: 15000,
    features: [
      "Inventory and sales records",
      "Customer balances and receipts",
      "Offline recording and cloud sync",
    ],
  },
  {
    id: "growth",
    name: "Growth",
    description: "More room to organise a growing business.",
    monthly: 3000,
    quarterly: 8000,
    yearly: 30000,
    features: [
      "Everything proposed for Starter",
      "Team roles and business settings",
      "Business insights and photo stock entry",
    ],
  },
] as const;
type Period = (typeof periods)[number]["id"];
type Preference = { plan: (typeof plans)[number]["id"]; period: Period };
const naira = (amount: number) =>
  new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(amount);

export default function SubscriptionPlans({
  businessId,
  canChoose = false,
}: {
  businessId?: string;
  canChoose?: boolean;
}) {
  const [period, setPeriod] = useState<Period>("monthly");
  const [preference, setPreference] = useState<Preference | null>(null);
  const [message, setMessage] = useState("");
  const storageKey = businessId
    ? `countiva-plan-preference:${businessId}`
    : null;
  useEffect(() => {
    if (!storageKey) return;
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || "null");
      if (
        saved &&
        plans.some((p) => p.id === saved.plan) &&
        periods.some((p) => p.id === saved.period)
      ) {
        setPreference(saved);
        setPeriod(saved.period);
      }
    } catch {
      /* A preference must never prevent access to business records. */
    }
  }, [storageKey]);
  function choose(plan: Preference["plan"]) {
    if (!storageKey || !canChoose) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify({ plan, period }));
      setPreference({ plan, period });
      setMessage(
        "Plan preference saved on this device. No payment taken and no subscription activated.",
      );
    } catch {
      setMessage(
        "Could not save your preference. Browser storage may be unavailable.",
      );
    }
  }
  const selectedPlan = plans.find((p) => p.id === preference?.plan);
  return (
    <section className="subscription-section" aria-labelledby="plans-heading">
      <div className="plans-intro">
        <span className="eyebrow">COUNTIVA PLANS</span>
        <h2 id="plans-heading">Small prices. A clearer business.</h2>
        <p>
          Choose a budget that works for your shop. All prices are in Nigerian
          naira, per business.
        </p>
      </div>
      <div className="billing-periods" role="group" aria-label="Billing period">
        {periods.map((p) => (
          <button
            key={p.id}
            aria-pressed={period === p.id}
            onClick={() => {
              setPeriod(p.id);
              setMessage("");
            }}
          >
            {p.label}
            {p.id === "yearly" && <span>Save up to 17%</span>}
          </button>
        ))}
      </div>
      <div className="plan-grid">
        {plans.map((plan) => {
          const selected =
            preference?.plan === plan.id && preference.period === period;
          const saving =
            plan.monthly * periods.find((p) => p.id === period)!.months -
            plan[period];
          return (
            <article
              className={`plan-card ${plan.id === "growth" ? "featured" : ""}`}
              key={plan.id}
            >
              <div className="plan-title">
                <h3>{plan.name}</h3>
                {plan.id === "growth" && (
                  <span className="badge">For growing shops</span>
                )}
              </div>
              <p>{plan.description}</p>
              <div className="plan-price">
                {naira(plan[period])}
                <span>
                  {" "}
                  /{" "}
                  {period === "monthly"
                    ? "month"
                    : period === "quarterly"
                      ? "3 months"
                      : "year"}
                </span>
              </div>
              <p className="plan-saving">
                {saving
                  ? `Save ${naira(saving)} compared with monthly pricing.`
                  : "One month at a time. A lighter commitment."}
              </p>
              <ul>
                {plan.features.map((feature) => (
                  <li key={feature}>
                    <Check size={17} aria-hidden="true" />
                    {feature}
                  </li>
                ))}
              </ul>
              {businessId ? (
                <button
                  className={`button ${plan.id === "growth" ? "primary" : "secondary"} full`}
                  disabled={!canChoose || selected}
                  onClick={() => choose(plan.id)}
                >
                  {selected
                    ? "Preference saved"
                    : `Save ${plan.name} preference`}
                </button>
              ) : (
                <a
                  className={`button ${plan.id === "growth" ? "primary" : "secondary"} full`}
                  href="/"
                >
                  Sign in to save a preference
                </a>
              )}
            </article>
          );
        })}
      </div>
      {selectedPlan && (
        <div className="plan-summary">
          <CreditCard size={20} />
          <div>
            <strong>
              Saved preference: {selectedPlan.name} ·{" "}
              {periods.find((p) => p.id === preference!.period)!.label}
            </strong>
            <p>
              {naira(selectedPlan[preference!.period])} per billing period.
              Subscription status: not active.
            </p>
          </div>
          {canChoose && (
            <button
              className="button secondary"
              onClick={() => {
                try {
                  localStorage.removeItem(storageKey!);
                  setPreference(null);
                  setMessage("Plan preference removed.");
                } catch {
                  setMessage("Could not remove the preference. Try again.");
                }
              }}
            >
              Clear preference
            </button>
          )}
        </div>
      )}
      {message && (
        <p className="banner" role="status">
          {message}
        </p>
      )}
      <p className="plans-disclosure">
        Introductory pricing proposal. Payments and automatic renewal are not
        enabled. Feature groupings describe the proposed plans; your current
        access is unchanged. Preferences stay on this browser and do not sync to
        your account.
        {businessId &&
          !canChoose &&
          " Only the business owner can change the plan preference."}
      </p>
    </section>
  );
}
