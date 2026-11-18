import ThemeControl from "../theme-control";
import Brand from "../brand";
import SubscriptionPlans from "../subscription-plans";
import { publicMetadata } from "../../lib/seo";

export const metadata = publicMetadata(
  "Countiva Pricing | Starter & Growth Subscription Plans",
  "Compare Countiva Starter and Growth plans for inventory, sales, receipts and team access. View monthly and longer-term pricing in Nigerian naira.",
  "/plans",
);

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
      <h1 className="plans-page-title">Countiva subscription plans</h1>
      <SubscriptionPlans />
    </main>
  );
}
