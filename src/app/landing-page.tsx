import {
  ArrowDownLeft,
  ArrowRight,
  Check,
  FileText,
  Package,
  ScanLine,
  ShieldCheck,
  ShoppingCart,
  TrendingUp,
  Users,
  WifiOff,
} from "lucide-react";
import Brand from "./brand";
import CountivaMark from "./countiva-mark";
import ThemeControl from "./theme-control";
import SubscriptionPlans from "./subscription-plans";
import LegacyAuthRedirect from "./legacy-auth-redirect";
const features = [
  {
    Icon: Package,
    title: "Stock, without the guesswork",
    copy: "Keep a product catalogue, record deliveries and adjustments, and spot stock that needs attention.",
  },
  {
    Icon: ShoppingCart,
    title: "Sales and customer credit",
    copy: "Record paid and part-paid sales. Follow repayments without counting them as new sales.",
  },
  {
    Icon: FileText,
    title: "Receipts worth handing over",
    copy: "Choose a receipt template, add your business details, and print or save a clear record for your customer.",
  },
  {
    Icon: ScanLine,
    title: "Bring your existing records",
    copy: "Import CSV or Excel records, or review stock suggested from a photo before adding it.",
  },
  {
    Icon: TrendingUp,
    title: "Understand what’s happening",
    copy: "See sales, estimated gross profit and stock patterns. Purchase a separate detailed analysis when you need a deeper review.",
  },
  {
    Icon: WifiOff,
    title: "Keep working through a weak connection",
    copy: "Prepared devices can record sales offline. Changes save on the device and retry online when the connection returns.",
  },
];
export default function LandingPage() {
  return (
    <main className="landing-page">
      <LegacyAuthRedirect />
      <header className="landing-header">
        <Brand />
        <nav aria-label="Public navigation">
          <a href="#features">Features</a>
          <a href="#why">Why Countiva</a>
          <a href="#pricing">Pricing</a>
        </nav>
        <div className="landing-header-actions">
          <ThemeControl />
          <a className="button secondary" href="/login">
            Log in
          </a>
          <a className="button primary" href="/signup">
            Get started <ArrowRight size={16} />
          </a>
        </div>
      </header>
      <section className="landing-hero">
        <div className="landing-hero-copy">
          <span className="eyebrow">
            BUILT FOR THE BUSINESS YOU’RE BUILDING
          </span>
          <h1>
            Your stock.
            <br />
            Your sales.
            <br />
            <span>Your peace of mind.</span>
          </h1>
          <p>
            Countiva brings your shop’s products, sales, receipts and customer
            balances into one clear workspace. Less time searching through
            notebooks. More time moving your business forward.
          </p>
          <div className="landing-hero-actions">
            <a className="button primary" href="/signup">
              Start your business workspace <ArrowRight size={18} />
            </a>
            <a className="button secondary" href="#features">
              Take a closer look
            </a>
          </div>
          <div className="landing-trust">
            <span>
              <Check size={15} />
              Made for retailers & wholesalers
            </span>
            <span>
              <ShieldCheck size={15} />
              Private business records
            </span>
          </div>
        </div>
        <div
          className="landing-workspace-preview"
          aria-label="Illustrative Countiva workspace preview"
        >
          <div className="landing-preview-top">
            <CountivaMark size={25} />
            <strong>Your shop, in view</strong>
            <span>Example workspace</span>
          </div>
          <div className="landing-preview-sales">
            <span>Sales today</span>
            <strong>
              ₦124,500<span>.00</span>
            </strong>
            <small>Know what came in. See what’s still due.</small>
          </div>
          <div className="landing-preview-grid">
            <div>
              <Package size={19} />
              <span>Your stock</span>
              <strong>Organised.</strong>
            </div>
            <div>
              <Users size={19} />
              <span>Customer credit</span>
              <strong>Accounted for.</strong>
            </div>
          </div>
          <div className="landing-preview-list">
            <div>
              <span>
                <Check size={16} />
              </span>
              <p>
                Sale recorded<small>Receipt ready to share</small>
              </p>
              <strong>All together</strong>
            </div>
            <div>
              <span>
                <ArrowDownLeft size={17} />
              </span>
              <p>
                Stock received<small>Every product has its place</small>
              </p>
              <strong>Up to date</strong>
            </div>
          </div>
          <div className="landing-preview-dock">
            <ShoppingCart size={19} />
            <span>
              <Package size={18} />
              Stock
            </span>
            <FileText size={19} />
            <TrendingUp size={19} />
          </div>
        </div>
      </section>
      <section className="landing-value-strip">
        <span>Stock that makes sense.</span>
        <span>Sales you can trace.</span>
        <span>Credit you can follow up.</span>
        <span>A clearer next step.</span>
      </section>
      <section className="landing-section" id="features">
        <div className="landing-section-heading">
          <span className="eyebrow">YOUR EVERYDAY BUSINESS, CONNECTED</span>
          <h2>
            Everything your shop needs.
            <br />
            Right where you need it.
          </h2>
          <p>
            Start with the records you already have. Build better habits as your
            business grows.
          </p>
        </div>
        <div className="landing-feature-grid">
          {features.map(({ Icon, title, copy }) => (
            <article className="landing-feature" key={title}>
              <span className="landing-feature-icon">
                <Icon size={23} />
              </span>
              <h3>{title}</h3>
              <p>{copy}</p>
            </article>
          ))}
        </div>
      </section>
      <section className="landing-why" id="why">
        <div>
          <span className="eyebrow">WHY WE BUILT COUNTIVA</span>
          <h2>
            A good business deserves
            <br />a clearer picture.
          </h2>
        </div>
        <div>
          <p>
            A stock count in one notebook. A customer balance in a chat.
            Receipts in a drawer. When your records are scattered, even a simple
            business decision takes more work than it should.
          </p>
          <p>
            Countiva was built to bring those everyday details together for
            small shops, retailers and wholesalers. It helps you see what you
            have, what you’ve sold and what you’re owed—so your next decision
            starts with useful information.
          </p>
          <a href="/signup" className="text-button">
            Make room for a simpler working day <ArrowRight size={17} />
          </a>
        </div>
      </section>
      <section className="landing-section landing-pricing" id="pricing">
        <SubscriptionPlans />
      </section>
      <section className="landing-final-cta">
        <CountivaMark size={48} inverse />
        <h2>Ready for a clearer working day?</h2>
        <p>Your next chapter starts with your first well-kept record.</p>
        <a className="button" href="/signup">
          Create your Countiva account <ArrowRight size={18} />
        </a>
        <a href="/login">Already using Countiva? Log in</a>
      </section>
      <footer className="landing-footer">
        <Brand />
        <span>Stock. Sales. A little more clarity.</span>
        <div>
          <a href="/plans">Plans</a>
          <a href="/login">Log in</a>
          <a href="/signup">Sign up</a>
        </div>
      </footer>
    </main>
  );
}
