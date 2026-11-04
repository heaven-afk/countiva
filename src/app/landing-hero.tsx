"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  Check,
  FileText,
  Leaf,
  Package,
  Pause,
  Play,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  TrendingUp,
  Users,
} from "lucide-react";
import CountivaMark from "./countiva-mark";

const weeklySales = [62000, 74000, 91000, 85000, 106000, 142000, 124500];
const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const naira = (amount: number) =>
  new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(amount);

function AnimatedAmount({
  amount,
  animate,
  decimals = false,
}: {
  amount: number;
  animate: boolean;
  decimals?: boolean;
}) {
  const [value, setValue] = useState(amount);
  useEffect(() => {
    if (!animate) {
      setValue(amount);
      return;
    }
    let frame = 0,
      started: number | null = null;
    const tick = (time: number) => {
      started ??= time;
      const progress = Math.min((time - started) / 1400, 1);
      setValue(Math.round(amount * (1 - Math.pow(1 - progress, 3))));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [amount, animate]);
  return (
    <strong
      aria-label={`${naira(amount)}${decimals ? ".00" : ""}`}
      className="hero-count"
    >
      <span aria-hidden="true">
        {naira(value)}
        {decimals && <span className="hero-count-decimals">.00</span>}
      </span>
    </strong>
  );
}

export default function LandingHero() {
  const hero = useRef<HTMLElement>(null);
  const [reduced, setReduced] = useState(true),
    [visible, setVisible] = useState(false),
    [pageVisible, setPageVisible] = useState(true),
    [paused, setPaused] = useState(false),
    [panel, setPanel] = useState<"shop" | "report">("shop");
  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(preference.matches);
    const visibility = () => setPageVisible(!document.hidden);
    update();
    visibility();
    preference.addEventListener("change", update);
    document.addEventListener("visibilitychange", visibility);
    const observer = new IntersectionObserver(
      ([entry]) => setVisible(entry.isIntersecting),
      { threshold: 0.1 },
    );
    if (hero.current) observer.observe(hero.current);
    return () => {
      observer.disconnect();
      preference.removeEventListener("change", update);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, []);
  const running = !reduced && visible && pageVisible && !paused;
  useEffect(() => {
    if (!running) return;
    const timer = setTimeout(
      () => setPanel((current) => (current === "shop" ? "report" : "shop")),
      8000,
    );
    return () => clearTimeout(timer);
  }, [running, panel]);
  function selectPanel(value: "shop" | "report") {
    setPanel(value);
    setPaused(true);
  }
  return (
    <section
      ref={hero}
      className="landing-hero landing-motion"
      data-motion={reduced ? "reduced" : running ? "running" : "paused"}
      style={
        { "--hero-play-state": running ? "running" : "paused" } as CSSProperties
      }
    >
      <div className="landing-hero-copy">
        <span className="eyebrow hero-fade hero-fade-first">
          BUILT FOR THE BUSINESS YOU’RE BUILDING
        </span>
        <h1
          className="animated-hero-title"
          aria-label="Your stock. Your sales. Your peace of mind."
        >
          <span className="hero-line hero-line-stock" aria-hidden="true">
            <span className="hero-word">Your stock.</span>
            <span className="hero-symbol hero-stock-symbol">
              <span className="stock-shelf">
                <Package className="stock-box stock-box-one" />
                <Package className="stock-box stock-box-two" />
                <Package className="stock-box stock-box-three" />
                <span className="stock-shelf-rule" />
              </span>
              <span className="symbol-caption">Every item, in its place.</span>
            </span>
          </span>
          <span className="hero-line hero-line-sales" aria-hidden="true">
            <span className="hero-word">Your sales.</span>
            <span className="hero-symbol hero-sales-symbol">
              <span className="hero-growth-bars">
                <i />
                <i />
                <i />
                <i />
                <TrendingUp />
              </span>
              <span className="symbol-caption">See your progress.</span>
            </span>
          </span>
          <span className="hero-line hero-line-peace" aria-hidden="true">
            <span className="hero-word">Your peace of mind.</span>
            <span className="hero-symbol hero-peace-symbol">
              <span className="peace-orbit">
                <Leaf />
                <Sparkles className="peace-sparkle" />
                <span className="peace-ring" />
              </span>
              <span className="symbol-caption">A little more clarity.</span>
            </span>
          </span>
        </h1>
        <p className="hero-fade hero-fade-second">
          Countiva brings your shop’s products, sales, receipts and customer
          balances into one clear workspace. Less time searching through
          notebooks. More time moving your business forward.
        </p>
        <div className="landing-hero-actions hero-fade hero-fade-third">
          <a className="button primary" href="/signup">
            Start your business workspace <ArrowRight size={18} />
          </a>
          <a className="button secondary" href="#features">
            Take a closer look
          </a>
        </div>
        <div className="landing-trust hero-fade hero-fade-third">
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
        className="landing-workspace-preview animated-workspace-preview"
        role="region"
        aria-label="Illustrative shop overview and business report"
      >
        <div className="landing-preview-top">
          <CountivaMark size={25} />
          <strong>
            {panel === "shop" ? "Your shop, in view" : "Your business report"}
          </strong>
          <span>Example workspace</span>
        </div>
        <div className="hero-preview-panels">
          <div
            className="hero-preview-pane"
            id="hero-shop-preview"
            data-active={panel === "shop"}
            aria-hidden={panel !== "shop"}
          >
            <div className="landing-preview-sales">
              <span>
                Sales today <TrendingUp size={17} className="hero-green" />
              </span>
              <AnimatedAmount
                amount={124500}
                animate={running && panel === "shop"}
                decimals
              />
              <small>Know what came in. See what’s still due.</small>
            </div>
            <div className="landing-preview-grid">
              <div>
                <Package size={19} className="hero-blue" />
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
                <span className="hero-green">
                  <Check size={16} />
                </span>
                <p>
                  Sale recorded<small>Receipt ready to share</small>
                </p>
                <strong>All together</strong>
              </div>
              <div>
                <span className="hero-blue">
                  <ArrowDownLeft size={17} />
                </span>
                <p>
                  Stock received<small>Every product has its place</small>
                </p>
                <strong>Up to date</strong>
              </div>
            </div>
          </div>
          <div
            className="hero-preview-pane hero-report-preview"
            id="hero-report-preview"
            data-active={panel === "report"}
            aria-hidden={panel !== "report"}
          >
            <div className="hero-report-summary">
              <div>
                <span>
                  <FileText size={15} className="hero-blue" />
                  Sales this week
                </span>
                <AnimatedAmount
                  amount={684500}
                  animate={running && panel === "report"}
                />
                <small>7 days of illustrative sales</small>
              </div>
              <span className="report-trend-mark">
                <ArrowUpRight size={27} />
              </span>
            </div>
            <div
              className="hero-report-chart"
              role="img"
              aria-label="Example daily sales: Monday 62,000 naira; Tuesday 74,000; Wednesday 91,000; Thursday 85,000; Friday 106,000; Saturday 142,000; Sunday 124,500."
            >
              <div className="hero-chart-heading">
                <strong>Daily sales</strong>
                <span>Mon – Sun</span>
              </div>
              <div className="hero-chart-bars" aria-hidden="true">
                {weeklySales.map((amount, index) => (
                  <div key={weekdays[index]}>
                    <div
                      className={`hero-report-bar ${index === 6 ? "latest-bar" : ""}`}
                      style={
                        {
                          "--bar-height": `${(amount / 142000) * 100}%`,
                          "--bar-delay": `${index * 65}ms`,
                        } as CSSProperties
                      }
                    />
                    <span>{weekdays[index]}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="hero-report-metrics">
              <div>
                <span>Estimated gross profit</span>
                <strong>₦125,948</strong>
                <small>Before expenses & tax</small>
              </div>
              <div>
                <span>Gross margin</span>
                <strong className="hero-green">18.4%</strong>
                <small>Based on recorded costs</small>
              </div>
            </div>
            <div className="hero-report-note">
              <Sparkles size={17} className="hero-blue" />
              <p>
                A clearer picture.
                <small>Spot patterns. Plan your next step.</small>
              </p>
            </div>
          </div>
        </div>
        <div className="hero-preview-controls">
          <div role="group" aria-label="Choose example preview">
            <button
              type="button"
              aria-pressed={panel === "shop"}
              aria-controls="hero-shop-preview"
              onClick={() => selectPanel("shop")}
            >
              <ShoppingCart size={16} />
              Shop overview
            </button>
            <button
              type="button"
              aria-pressed={panel === "report"}
              aria-controls="hero-report-preview"
              onClick={() => selectPanel("report")}
            >
              <FileText size={16} />
              Report
            </button>
          </div>
          <button
            type="button"
            className="hero-motion-control"
            aria-label={
              paused ? "Play hero animations" : "Pause hero animations"
            }
            title={
              reduced
                ? "Animations follow your reduced-motion preference"
                : paused
                  ? "Play animations"
                  : "Pause animations"
            }
            disabled={reduced}
            onClick={() => setPaused((current) => !current)}
          >
            {paused || reduced ? <Play size={16} /> : <Pause size={16} />}
          </button>
        </div>
      </div>
    </section>
  );
}
