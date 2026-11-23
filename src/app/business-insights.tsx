"use client";
import Skeleton from "./skeleton";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowUpRight, Download, ChartNoAxesCombined } from "lucide-react";
import { buildAnalytics, type AnalyticsReport } from "../lib/analytics";
import { money, type State } from "../lib/domain";
import { getSupabase } from "../lib/supabase";
import { authenticatedFetch } from "../lib/api-client";
import { csvExport } from "../lib/record-import";
import useEntitlements from "./use-entitlements";
import { analyticsLevel, scopeAnalytics } from "../lib/analytics-access";
import DiscountBreakdown from "./discount-breakdown";
import { readSaveStatus } from "../lib/storage";
type Brief = { summary: string; observations: string[]; actions: string[] };
export default function BusinessInsights({
  state,
  businessId,
  role,
  onNavigate,
}: {
  state: State;
  businessId: string;
  role?: string;
  onNavigate: (page: string) => void;
}) {
  const [days, setDays] = useState(30),
    [busy, setBusy] = useState(""),
    [message, setMessage] = useState(""),
    [brief, setBrief] = useState<{
      brief: Brief;
      asOf: string;
      financialsAsOf?: string;
      financials?: {
        salesMade: number;
        grossProfit: number;
        collected: number;
        outstanding: number;
        discountsGiven: number;
        availableCash: null;
      };
    } | null>(null),
    [reports, setReports] = useState<
      Array<{
        id: string;
        status: string;
        generatedAt: string | null;
        days?: number;
        kind?: string;
      }>
    >([]),
    [savedReport, setReport] = useState<AnalyticsReport | null>(null),
    [reportsLoaded, setReportsLoaded] = useState(false);
  const rawReport = useMemo(() => buildAnalytics(state, days), [state, days]);
  const {
    entitlements,
    error: accessError,
    reload: reloadAccess,
  } = useEntitlements(businessId);
  const reportElement = useRef<HTMLElement>(null);
  const errorElement = useRef<HTMLParagraphElement>(null);
  const requestRunning = useRef(false);
  const level = entitlements ? analyticsLevel(entitlements) : "none";
  const advanced = level === "business";
  const report = useMemo(
    () =>
      savedReport && level !== "none"
        ? scopeAnalytics(savedReport, level)
        : null,
    [savedReport, level],
  );
  useEffect(() => {
    setBrief(null);
  }, [level]);
  const reportBase = scopeAnalytics(
    rawReport,
    advanced ? "business" : "growth",
  );
  useEffect(() => {
    if (!advanced && days > 30) setDays(30);
  }, [advanced, days]);
  useEffect(() => {
    if (report) {
      reportElement.current?.focus({ preventScroll: true });
      reportElement.current?.scrollIntoView({ block: "start" });
    }
  }, [report]);
  useEffect(() => {
    if (message) {
      errorElement.current?.focus({ preventScroll: true });
      errorElement.current?.scrollIntoView({ block: "center" });
    }
  }, [message]);
  useEffect(() => {
    setReport(null);
  }, [days]);
  async function checkSavedRecords() {
    if (!navigator.onLine)
      throw new Error(
        "Connect to the internet to generate a report from your saved business records.",
      );
    if ((await readSaveStatus(businessId)).pendingIds.length)
      throw new Error(
        "Some changes are still waiting to sync. Keep Countiva online until they are saved, then generate your report again.",
      );
  }
  async function refresh() {
    const result = await getSupabase()?.rpc("list_business_reports", {
      bid: businessId,
    });
    if (result?.error)
      setMessage(
        "Saved reports could not be loaded. Check your connection and try again.",
      );
    if (result?.data) setReports(result.data);
    setReportsLoaded(true);
  }
  useEffect(() => {
    if (!entitlements?.hasAccess || level === "none") return;
    void refresh();
    const linkedReport = new URLSearchParams(window.location.search).get(
      "report",
    );
    if (
      linkedReport &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        linkedReport,
      )
    ) {
      void getSupabase()
        ?.rpc("get_business_report", {
          bid: businessId,
          report_id: linkedReport,
        })
        .then((result) => {
          if (result.error)
            setMessage(
              "This report could not be opened. Check your access and connection.",
            );
          else setReport(result.data);
        });
    }
  }, [businessId, level, entitlements?.hasAccess]);
  async function aiBrief() {
    if (requestRunning.current) return;
    requestRunning.current = true;
    setBusy("brief");
    setMessage("");
    try {
      await checkSavedRecords();
      setBrief(await authenticatedFetch("/api/insights", { businessId }));
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      requestRunning.current = false;
      setBusy("");
    }
  }
  async function prepare() {
    if (requestRunning.current) return;
    requestRunning.current = true;
    setBusy("report");
    setMessage("");
    try {
      await checkSavedRecords();
      const result = await authenticatedFetch("/api/analytics/report", {
        businessId,
        days,
      });
      if (!result.report?.metrics || !result.report.asOf)
        throw new Error(
          "Countiva did not return a usable report. Refresh the page and try again.",
        );
      setReport(result.report);
      void refresh();
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      requestRunning.current = false;
      setBusy("");
    }
  }
  async function open(item: { id: string; status: string; days?: number }) {
    setBusy(item.id);
    setMessage("");
    try {
      if (item.status === "ready") {
        const result = await getSupabase()!.rpc("get_business_report", {
          bid: businessId,
          report_id: item.id,
        });
        if (result.error) throw result.error;
        setReport(result.data);
      } else {
        const result = await authenticatedFetch("/api/analytics/report", {
          businessId,
          ...(item.days ? {} : { reportId: item.id }),
          days: item.days || days,
        });
        setReport(result.report);
        void refresh();
      }
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  function exportReport() {
    if (!report) return;
    const rows: unknown[][] = [
      [
        "Countiva detailed analytics",
        report.days + " days",
        "Generated",
        report.asOf,
      ],
      ["Metric", "Amount / count"],
      ...Object.entries(report.metrics).map(([key, value]) => [
        key,
        typeof value === "number" &&
        !["sales", "grossMarginPercent"].includes(key)
          ? value / 100
          : value,
      ]),
      [],
      [
        "Product",
        "Unit",
        "Units sold",
        "Sales (NGN)",
        "Recorded cost (NGN)",
        "Gross profit (NGN)",
        "Gross margin (%)",
        "Estimated stock cover (days)",
        "Inventory at recorded cost (NGN)",
        "Discounts given (NGN)",
      ],
      ...report.products.map((p) => [
        p.name,
        p.unit,
        p.units,
        p.revenue / 100,
        p.cost / 100,
        p.grossProfit / 100,
        p.marginPercent ?? "",
        p.estimatedStockDays ?? "",
        p.inventoryAtCost == null ? "" : p.inventoryAtCost / 100,
        (p.discountsGiven || 0) / 100,
      ]),
      [],
      [
        "Date",
        "Sales (NGN)",
        "Gross profit (NGN)",
        "Transactions",
        "Discounts given (NGN)",
      ],
      ...report.daily.map((d) => [
        d.date,
        d.revenue / 100,
        d.grossProfit / 100,
        d.sales,
        (d.discountsGiven || 0) / 100,
      ]),
      [],
      ["Customer balance age", "Balance (NGN)"],
      ...report.creditAge.map((bucket) => [bucket.label, bucket.amount / 100]),
      [],
      ["Payment method", "Sales count", "Initial collections (NGN)"],
      ...report.paymentMix.map((method) => [
        method.method,
        method.sales,
        method.amount / 100,
      ]),
      [],
      ["Priority", "Action", "Evidence", "Suggested steps"],
      ...(report.intelligence?.actionPlan.map((a) => [
        a.priority,
        a.title,
        a.evidence,
        a.steps,
      ]) || []),
      [],
      ["Report limitations"],
      ...report.notes.map((note) => [note]),
    ];
    const url = URL.createObjectURL(
      new Blob([csvExport(rows)], { type: "text/csv;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "countiva-detailed-analytics.csv";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  if (!entitlements && accessError)
    return (
      <section className="panel">
        <h2>Couldn’t check your insight access</h2>
        <p role="alert">{accessError}</p>
        <button className="button primary" onClick={() => void reloadAccess()}>
          Retry access check
        </button>
      </section>
    );
  if (!entitlements)
    return <Skeleton label="Checking business insight access" />;
  if (!entitlements.hasAccess)
    return (
      <section className="panel">
        <h2>
          {entitlements.status === "paused"
            ? "Business access is paused"
            : "Your access period has ended"}
        </h2>
        <p>
          Your recorded data is retained. Check Subscription to restore access
          to business insights.
        </p>
        <button
          className="button primary"
          onClick={() => onNavigate("Subscription")}
        >
          View subscription
        </button>
      </section>
    );
  if (level === "none")
    return (
      <section className="panel premium-analytics">
        <span className="eyebrow">GROWTH & BUSINESS FEATURE</span>
        <h2>Unlock business insights</h2>
        <p>
          Business insights are available on Growth and Business plans. Starter
          covers your stock, sales and receipts. Growth adds performance
          summaries and standard reports; Business adds deeper product, profit,
          stock and customer analysis.
        </p>
        <button
          className="button primary"
          onClick={() => onNavigate("Subscription")}
        >
          View Growth & Business plans
        </button>
      </section>
    );
  return (
    <div className="business-insights">
      <div className="analytics-toolbar">
        <div>
          <span className="eyebrow">BUSINESS INTELLIGENCE</span>
          <p className="form-note">
            {advanced
              ? "Advanced Business analysis"
              : "Growth standard analysis"}
            {advanced && entitlements.tier === "growth"
              ? " · retained access from your earlier Growth terms"
              : entitlements.status === "trial"
                ? " · free Growth trial"
                : ""}
          </p>
          <h2>Understand performance. Plan your next move.</h2>
          <p>
            Estimated gross profit excludes operating expenses and tax.
            Collections and sales are shown separately.
          </p>
        </div>
        <label>
          Reporting period
          <select value={days} onChange={(e) => setDays(+e.target.value)}>
            <option value={7}>Last 7 days</option>
            <option value={1}>Today</option>
            <option value={30}>Last 30 days</option>
            {advanced && <option value={90}>Last 90 days</option>}
          </select>
        </label>
      </div>
      <p className="form-note">
        The overview below uses this device’s current records. Generated reports
        use records saved online and show their snapshot time.
      </p>
      {message && (
        <p
          ref={errorElement}
          tabIndex={-1}
          className="banner receipt-export-error"
          role="alert"
        >
          {message}
        </p>
      )}
      <div className="stats">
        {[
          ["Sales value", reportBase.metrics.revenue],
          ["Estimated gross profit", reportBase.metrics.grossProfit],
          ["Money collected", reportBase.metrics.collected],
          ["Customer credit balance", reportBase.metrics.credit],
        ].map(([title, value]) => (
          <section className="stat" key={String(title)}>
            <div className="stat-label">{String(title)}</div>
            <div className="stat-value">{money(Number(value))}</div>
            <small>
              {title === "Customer credit balance"
                ? "Across all saved sales"
                : `Selected ${days}-day period`}
            </small>
          </section>
        ))}
      </div>
      <div className="insights-grid">
        {reportBase.insights.map((insight) => (
          <section className="panel insight-detail" key={insight.kind}>
            <span className="eyebrow">{insight.kind.toUpperCase()}</span>
            <h2>{insight.title}</h2>
            <p>{insight.body}</p>
            <button
              className="text-button"
              onClick={() => onNavigate(insight.page)}
            >
              {insight.action}
              <ArrowUpRight size={16} />
            </button>
          </section>
        ))}
      </div>
      {advanced && <DiscountBreakdown state={state} />}
      <section className="panel ai-brief-panel">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">AI BUSINESS BRIEF</span>
            <h2>A daily explanation of your records</h2>
            <p>
              One shared brief per business each day, based on the last 30 days
              of records saved online.
            </p>
          </div>
          <button
            className="button secondary"
            disabled={
              !!busy ||
              !entitlements?.hasAccess ||
              !["owner", "manager"].includes(role || "")
            }
            onClick={() => void aiBrief()}
          >
            <ChartNoAxesCombined size={17} />
            {busy === "brief"
              ? "Preparing your brief…"
              : "Create today’s AI brief"}
          </button>
        </div>
        {busy === "brief" && (
          <Skeleton compact label="Preparing your daily business brief" />
        )}
        {brief && (
          <div className="ai-brief-content">
            <small>
              Prepared{" "}
              {new Date(brief.asOf).toLocaleString("en-NG", {
                timeZone: "Africa/Lagos",
              })}
            </small>
            <p>{brief.brief.summary}</p>
            {brief.financials && (
              <>
                <div className="stats report-summary">
                  {[
                    ["Sales made", money(brief.financials.salesMade)],
                    [
                      "Estimated gross profit",
                      money(brief.financials.grossProfit),
                    ],
                    ["Money collected", money(brief.financials.collected)],
                    [
                      "Customer balances · all sales",
                      money(brief.financials.outstanding),
                    ],
                    ["Discounts given", money(brief.financials.discountsGiven)],
                    ["Available cash balance", "Not tracked"],
                  ].map(([label, value]) => (
                    <div className="stat" key={label}>
                      <div className="stat-label">{label}</div>
                      <div className="stat-value">{value}</div>
                    </div>
                  ))}
                </div>
                <p className="form-note">
                  Last 30 days, except customer balances. Gross profit excludes
                  expenses and tax. Collections include recorded repayments; a
                  spendable cash balance also needs expenses and withdrawals.
                  Figures as of{" "}
                  {new Date(brief.financialsAsOf || brief.asOf).toLocaleString(
                    "en-NG",
                    { timeZone: "Africa/Lagos" },
                  )}
                  .
                </p>
              </>
            )}
            <ul>
              {brief.brief.observations.map((text, index) => (
                <li key={index}>{text}</li>
              ))}
            </ul>
            <h3>Checks to consider</h3>
            <ul>
              {brief.brief.actions.map((text, index) => (
                <li key={index}>{text}</li>
              ))}
            </ul>
          </div>
        )}
      </section>
      <section className="panel premium-analytics">
        <div>
          <span className="eyebrow">
            PREMIUM ANALYSIS · INCLUDED IN YOUR PLAN
          </span>
          <h2>
            {advanced
              ? "Turn your records into a practical business plan"
              : "A clear view of business performance"}
          </h2>
          <p>
            {advanced
              ? "Get product margins, stock cover, idle inventory, customer balance age, payment mix, period comparisons and a prioritised action plan. Review up to 90 days of records."
              : "Review sales, recorded gross profit, collections and customer balances over 1, 7 or 30 days, with daily totals and a concise explanation. Upgrade to Business for the complete product and customer breakdown."}
          </p>
          <ul>
            <li>Included in Growth, Business and active Growth trials</li>
            <li>
              Saved report with CSV export; its figures stay at the displayed
              snapshot time
            </li>
            <li>
              One saved snapshot per period each Lagos calendar day, including a
              daily view
            </li>
            <li>
              Sync your latest records before preparing your first report today
            </li>
          </ul>
        </div>
        <div className="premium-analytics-price">
          <ChartNoAxesCombined size={22} />
          <strong>Included</strong>
          <span>No additional report charge</span>
          <button
            className="button primary"
            disabled={
              !!busy ||
              !["owner", "manager"].includes(role || "") ||
              !entitlements?.hasAccess
            }
            onClick={() => void prepare()}
          >
            {busy === "report"
              ? "Preparing report…"
              : `Prepare ${days}-day report`}
          </button>
          {busy === "report" && (
            <div role="status">
              <p>
                Generating your business report. This can take up to a minute.
              </p>
              <Skeleton compact label="Generating your business report" />
            </div>
          )}
          {!["owner", "manager"].includes(role || "") && (
            <small>An owner or manager can prepare a report.</small>
          )}
          {!entitlements?.hasAccess && (
            <small>An active subscription or trial is required.</small>
          )}
        </div>
      </section>
      <section className="panel report-library">
        <div className="panel-heading">
          <div>
            <h2>Your detailed reports</h2>
            <p>
              Saved snapshots stay fixed at their preparation time. Previously
              purchased reports remain in your library.
            </p>
          </div>
          <button className="button secondary" onClick={() => void refresh()}>
            Refresh reports
          </button>
        </div>
        {!reportsLoaded ? (
          <Skeleton compact label="Loading saved reports" />
        ) : !reports.length ? (
          <div className="empty">
            Prepare your first included report using the button above.
          </div>
        ) : (
          <div className="report-list">
            {reports.map((item) => (
              <div key={item.id}>
                <span>
                  <strong>
                    {item.generatedAt
                      ? new Date(item.generatedAt).toLocaleString("en-NG", {
                          timeZone: "Africa/Lagos",
                        })
                      : "Report ready to prepare"}
                  </strong>
                  <small>
                    {item.status === "ready"
                      ? `${item.kind ? item.kind.replace("_report", " report") : "Saved snapshot"}${item.days ? ` · ${item.days} days` : ""}`
                      : item.status === "processing"
                        ? "Being prepared"
                        : "Choose a period, then prepare this report"}
                  </small>
                </span>
                <button
                  className="button secondary"
                  disabled={!!busy}
                  onClick={() => void open(item)}
                >
                  {busy === item.id
                    ? "Preparing…"
                    : item.status === "ready"
                      ? "View report"
                      : "Prepare report"}
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
      {report && (
        <section
          ref={reportElement}
          tabIndex={-1}
          className="panel full-report"
          aria-label="Generated business report"
        >
          <div className="panel-heading">
            <div>
              <span className="eyebrow">YOUR BUSINESS REPORT</span>
              <h2>{report.days}-day business breakdown</h2>
              <p>
                Snapshot:{" "}
                {new Date(report.asOf).toLocaleString("en-NG", {
                  timeZone: "Africa/Lagos",
                })}
              </p>
            </div>
            <button className="button secondary" onClick={exportReport}>
              <Download size={16} />
              Export report CSV
            </button>
          </div>
          <div className="stats report-summary">
            {[
              ["Sales value", money(report.metrics.revenue)],
              ["Recorded cost of goods", money(report.metrics.cogs)],
              ["Gross profit", money(report.metrics.grossProfit)],
              [
                "Gross margin",
                report.metrics.grossMarginPercent === null
                  ? "No sales yet"
                  : `${report.metrics.grossMarginPercent.toFixed(1)}%`,
              ],
              ["Average transaction", money(report.metrics.averageSale)],
              [
                "Inventory at recorded cost",
                money(report.metrics.inventoryAtCost),
              ],
              ["Money collected", money(report.metrics.collected)],
              ["Customer credit · all sales", money(report.metrics.credit)],
              ["Discounts given", money(report.metrics.discountsGiven || 0)],
            ].map(([label, value]) => (
              <div className="stat" key={label}>
                <div className="stat-label">{label}</div>
                <div className="stat-value">{value}</div>
              </div>
            ))}
          </div>
          {advanced && report.intelligence && (
            <>
              <div className="report-detail-grid">
                <div>
                  <h3>Growth & collections</h3>
                  <p>
                    <span>Sales vs previous {report.days} days</span>
                    <strong>
                      {report.intelligence.revenueChangePercent === null
                        ? "More history needed"
                        : `${report.intelligence.revenueChangePercent >= 0 ? "+" : ""}${report.intelligence.revenueChangePercent.toFixed(1)}%`}
                    </strong>
                  </p>
                  <p>
                    <span>Paid at the time of sale</span>
                    <strong>
                      {report.intelligence.initialCollectionPercent === null
                        ? "No sales yet"
                        : `${report.intelligence.initialCollectionPercent.toFixed(1)}%`}
                    </strong>
                  </p>
                  <p>
                    <span>Repayments received in period</span>
                    <strong>
                      {money(report.intelligence.repaymentsCollected)}
                    </strong>
                  </p>
                  <small>
                    Collections can include older sales. They are not additional
                    sales revenue.
                  </small>
                </div>
                <div>
                  <h3>Stock efficiency</h3>
                  <p>
                    <span>Stock with no sales in period</span>
                    <strong>{report.intelligence.idleProducts} products</strong>
                  </p>
                  <p>
                    <span>Capital in those products</span>
                    <strong>
                      {money(report.intelligence.idleInventoryAtCost)}
                    </strong>
                  </p>
                  <small>
                    Based on recorded purchase costs and current quantities.
                    Check missing records before changing purchasing.
                  </small>
                </div>
              </div>
              <h3>Your priorities</h3>
              <div className="insights-grid report-action-plan">
                {report.intelligence.actionPlan.map((action) => (
                  <article className="insight-detail" key={action.title}>
                    <span className="eyebrow">{action.priority}</span>
                    <h3>{action.title}</h3>
                    <p>{action.evidence}</p>
                    <p>{action.steps}</p>
                    <button
                      className="text-button"
                      onClick={() => onNavigate(action.page)}
                    >
                      Review records <ArrowUpRight size={16} />
                    </button>
                  </article>
                ))}
              </div>
            </>
          )}
          {!report.aiSummary && (
            <p className="form-note">
              This report uses calculations and practical checks from your saved
              records. An AI explanation is added when the service is available.
              {report.aiError && <> {report.aiError}</>}
            </p>
          )}
          {report.aiSummary && (
            <div className="ai-brief-content">
              <h3>AI explanation</h3>
              <p>{report.aiSummary.summary}</p>
              <ul>
                {report.aiSummary.observations.map((text, index) => (
                  <li key={index}>{text}</li>
                ))}
              </ul>
              <h3>Suggested checks</h3>
              <ul>
                {report.aiSummary.actions.map((text, index) => (
                  <li key={index}>{text}</li>
                ))}
              </ul>
            </div>
          )}
          {advanced && (
            <>
              <h3>Product performance</h3>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th>Units sold</th>
                      <th>Sales value</th>
                      <th>Recorded cost</th>
                      <th>Gross profit</th>
                      <th>Gross margin</th>
                      <th>Estimated stock cover</th>
                      <th>Discounts given</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.products.map((p) => (
                      <tr key={p.id}>
                        <td>
                          {p.name}
                          <small>{p.unit}</small>
                        </td>
                        <td>{p.units}</td>
                        <td>{money(p.revenue)}</td>
                        <td>{money(p.cost)}</td>
                        <td>{money(p.grossProfit)}</td>
                        <td>
                          {p.marginPercent == null
                            ? "—"
                            : `${p.marginPercent.toFixed(1)}%`}
                        </td>
                        <td>
                          {p.estimatedStockDays == null
                            ? "—"
                            : `${p.estimatedStockDays} days`}
                        </td>
                        <td>{money(p.discountsGiven || 0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="report-detail-grid">
                <div>
                  <h3>Customer balance age</h3>
                  {report.creditAge.map((bucket) => (
                    <p key={bucket.label}>
                      <span>{bucket.label}</span>
                      <strong>{money(bucket.amount)}</strong>
                    </p>
                  ))}
                  <small>
                    Age of the original sale; these are not overdue labels.
                  </small>
                </div>
                <div>
                  <h3>Payment mix</h3>
                  {report.paymentMix.map((method) => (
                    <p key={method.method}>
                      <span>
                        {method.method} · {method.sales} sales
                      </span>
                      <strong>{money(method.amount)}</strong>
                    </p>
                  ))}
                  <small>Initial payments on sales in this period.</small>
                </div>
              </div>
            </>
          )}
          {!advanced && (
            <p className="form-note">
              Business unlocks product-by-product margins, stock cover, customer
              balance aging, payment mix and a detailed action plan.
            </p>
          )}
          <h3>Daily performance</h3>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Sales</th>
                  <th>Sales value</th>
                  <th>Gross profit</th>
                  <th>Discounts given</th>
                </tr>
              </thead>
              <tbody>
                {report.daily.map((d) => (
                  <tr key={d.date}>
                    <td>{d.date}</td>
                    <td>{d.sales}</td>
                    <td>{money(d.revenue)}</td>
                    <td>{money(d.grossProfit)}</td>
                    <td>{money(d.discountsGiven || 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="report-notes">
            {report.notes.map((note) => (
              <p className="form-note" key={note}>
                {note}
              </p>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
