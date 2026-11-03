import Brand from "../brand";
import SubscriptionPlans from "../subscription-plans";

export default function PlansPage() {
  return (
    <main className="plans-page">
      <header>
        <Brand />
        <a className="button secondary" href="/">
          Back to Countiva
        </a>
      </header>
      <SubscriptionPlans />
    </main>
  );
}
