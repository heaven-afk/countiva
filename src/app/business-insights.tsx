"use client";
import Skeleton from "./skeleton";
import { useEffect, useMemo, useState } from "react";
import { ArrowUpRight, Download, Sparkles, Lock } from "lucide-react";
import { buildAnalytics, type AnalyticsReport } from "../lib/analytics";
import { money, type State } from "../lib/domain";
import { getSupabase } from "../lib/supabase";
import { authenticatedFetch } from "../lib/api-client";
import { csvExport } from "../lib/record-import";
import useEntitlements from "./use-entitlements";
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
    [brief, setBrief] = useState<{ brief: Brief; asOf: string } | null>(null),
    [reports, setReports] = useState<
      Array<{ id: string; status: string; generatedAt: string | null }>
    >([]),
    [report, setReport] = useState<AnalyticsReport | null>(null),
    [reportsLoaded, setReportsLoaded] = useState(false);
  const reportBase = useMemo(() => buildAnalytics(state, days), [state, days]);
  const { entitlements } = useEntitlements(businessId);
  async function refresh() {
    const result = await getSupabase()?.rpc("list_business_reports", {
      bid: businessId,
    });
    if (result?.data) setReports(result.data);
    setReportsLoaded(true);
  }
  useEffect(() => {
    void refresh();
  }, [businessId]);
  async function aiBrief() {
    setBusy("brief");
    setMessage("");
    try {
      setBrief(await authenticatedFetch("/api/insights", { businessId }));
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  async function purchase() {
    setBusy("purchase");
    setMessage("");
    try {
      const result = await authenticatedFetch("/api/billing/checkout", {
        businessId,
        offerCode: "analytics-report",
      });
      window.location.assign(result.url);
    } catch (e) {
      setMessage((e as Error).message);
      setBusy("");
    }
  }
  async function open(item: { id: string; status: string }) {
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
          reportId: item.id,
          days,
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
      ],
      ...report.products.map((p) => [
        p.name,
        p.unit,
        p.units,
        p.revenue / 100,
        p.cost / 100,
        p.grossProfit / 100,
      ]),
      [],
      ["Date", "Sales (NGN)", "Gross profit (NGN)", "Transactions"],
      ...report.daily.map((d) => [
        d.date,
        d.revenue / 100,
        d.grossProfit / 100,
        d.sales,
      ]),
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
  return (
    <div className="business-insights">
      <div className="analytics-toolbar">
        <div>
          <h2>Useful numbers. Clearer decisions.</h2>
          <p>
            Estimated gross profit excludes operating expenses and tax.
            Collections and sales are shown separately.
          </p>
        </div>
        <label>
          Reporting period
          <select value={days} onChange={(e) => setDays(+e.target.value)}>
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
          </select>
        </label>
      </div>
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
            <Sparkles size={17} />
            {busy === "brief"
              ? "Preparing your brief…"
              : "Create today’s AI brief"}
          </button>
        </div>
        {brief && (
          <div className="ai-brief-content">
            <small>
              Prepared{" "}
              {new Date(brief.asOf).toLocaleString("en-NG", {
                timeZone: "Africa/Lagos",
              })}
            </small>
            <p>{brief.brief.summary}</p>
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
          <span className="eyebrow">A DEEPER LOOK, WHEN YOU NEED IT</span>
          <h2>Detailed business analytics</h2>
          <p>
            Get product-by-product sales and recorded margins, daily
            performance, payment mix, customer balance age and an AI explanation
            where available. Each purchase gives one saved report snapshot for a
            7-, 30- or 90-day period.
          </p>
          <ul>
            <li>Separate from your regular subscription</li>
            <li>Saved report with CSV export</li>
            <li>Generated from records already saved online</li>
          </ul>
        </div>
        <div className="premium-analytics-price">
          <Lock size={22} />
          <strong>₦5,000</strong>
          <span>per report snapshot</span>
          <button
            className="button primary"
            disabled={!!busy || role !== "owner" || !entitlements?.hasAccess}
            onClick={() => void purchase()}
          >
            {busy === "purchase"
              ? "Opening checkout…"
              : "Purchase detailed report"}
          </button>
          {role !== "owner" && (
            <small>The business owner manages report purchases.</small>
          )}
        </div>
      </section>
      <section className="panel report-library">
        <div className="panel-heading">
          <div>
            <h2>Your detailed reports</h2>
            <p>
              Select the reporting period above before preparing a newly
              purchased report.
            </p>
          </div>
          <button className="button secondary" onClick={() => void refresh()}>
            Refresh purchases
          </button>
        </div>
        {!reportsLoaded ? (
          <Skeleton compact label="Loading purchased reports" />
        ) : !reports.length ? (
          <div className="empty">Your purchased reports will appear here.</div>
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
                      : "Report purchase ready"}
                  </strong>
                  <small>
                    {item.status === "ready"
                      ? "Saved snapshot"
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
        <section className="panel full-report">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">YOUR PAID REPORT</span>
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
          <h3>Daily performance</h3>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Sales</th>
                  <th>Sales value</th>
                  <th>Gross profit</th>
                </tr>
              </thead>
              <tbody>
                {report.daily.map((d) => (
                  <tr key={d.date}>
                    <td>{d.date}</td>
                    <td>{d.sales}</td>
                    <td>{money(d.revenue)}</td>
                    <td>{money(d.grossProfit)}</td>
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
      {busy && busy !== "purchase" && (
        <Skeleton
          compact
          label={
            busy === "brief"
              ? "Preparing your daily business brief"
              : "Preparing your detailed report"
          }
        />
      )}
      {message && (
        <p className="banner" role="status">
          {message}
        </p>
      )}
    </div>
  );
}
