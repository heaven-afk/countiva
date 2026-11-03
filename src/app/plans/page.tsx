import ThemeControl from "../theme-control";
import Brand from "../brand";
import SubscriptionPlans from "../subscription-plans";

export default function PlansPage() {
  return (
    <main className="plans-page">
      <header>
        <Brand />
        <div className="plans-header-actions">
          <ThemeControl />
          <a className="button secondary" href="/">
            Back to Countiva
          </a>
        </div>
      </header>
      <SubscriptionPlans />
    </main>
  );
}
