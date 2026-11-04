import Brand from "./brand";
import ThemeControl from "./theme-control";
import CountivaMark from "./countiva-mark";

export default function NotFound() {
  return (
    <main className="not-found-page">
      <header>
        <Brand />
        <ThemeControl />
      </header>
      <section>
        <CountivaMark size={56} />
        <span className="eyebrow">PAGE NOT FOUND</span>
        <h1>Let’s get you back to business.</h1>
        <p>
          This page isn’t available. Open your workspace or explore Countiva’s
          plans.
        </p>
        <div>
          <a className="button primary" href="/workspace">
            Open workspace
          </a>
          <a className="button secondary" href="/plans">
            Explore plans
          </a>
        </div>
      </section>
    </main>
  );
}
