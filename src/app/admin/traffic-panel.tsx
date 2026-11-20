"use client";
import { useEffect, useState, useRef } from "react";
import { authenticatedFetch } from "../../lib/api-client";
type Traffic = {
  days: number;
  asOf: string;
  pageViews: number;
  sessions: number;
  newBusinesses: number;
  daily: { day: string; views: number; sessions: number }[];
  pages: { path: string; views: number; sessions: number }[];
  sources: { source: string; sessions: number }[];
};
export default function TrafficPanel() {
  const [days, setDays] = useState(30),
    [data, setData] = useState<Traffic | null>(null),
    [message, setMessage] = useState("");
  const generation = useRef(0);
  async function load() {
    const revision = ++generation.current;
    setMessage("");
    try {
      const result = await authenticatedFetch("/api/admin/operations", {
        action: "traffic",
        days,
      });
      if (revision === generation.current) setData(result);
    } catch (e) {
      if (revision === generation.current) setMessage((e as Error).message);
    }
  }
  useEffect(() => {
    void load();
    return () => {
      generation.current++;
    };
  }, [days]);
  return (
    <section className="panel admin-operations" id="admin-traffic">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">WEBSITE DISCOVERY</span>
          <h2>Website visits & acquisition</h2>
          <p>
            Public-page views and estimated browser sessions since tracking was
            enabled. These are not verified unique people or search impressions.
          </p>
        </div>
        <label>
          Traffic period
          <select value={days} onChange={(e) => setDays(+e.target.value)}>
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
          </select>
        </label>
        <button className="button secondary" onClick={() => void load()}>
          Refresh traffic
        </button>
      </div>
      <div className="admin-operations-body">
        {data && (
          <>
            <div className="stats">
              {[
                ["Public page views", data.pageViews],
                ["Estimated sessions", data.sessions],
                ["New businesses", data.newBusinesses],
              ].map(([label, n]) => (
                <div className="stat" key={String(label)}>
                  <span className="stat-label">{label}</span>
                  <strong className="stat-value">{n}</strong>
                </div>
              ))}
            </div>
            <div className="report-detail-grid">
              <div>
                <h3>Pages visited</h3>
                {data.pages.length ? (
                  data.pages.map((p) => (
                    <p key={p.path}>
                      <span>{p.path}</span>
                      <strong>
                        {p.views} views · {p.sessions} sessions
                      </strong>
                    </p>
                  ))
                ) : (
                  <p>
                    Visits will appear after the tracker is deployed and public
                    pages are opened.
                  </p>
                )}
              </div>
              <div>
                <h3>Referring websites</h3>
                {data.sources.map((s) => (
                  <p key={s.source}>
                    <span>{s.source}</span>
                    <strong>{s.sessions} sessions</strong>
                  </p>
                ))}
              </div>
            </div>
            <details>
              <summary>Daily traffic counts</summary>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Views</th>
                      <th>Sessions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.daily.map((d) => (
                      <tr key={d.day}>
                        <td>{String(d.day).slice(0, 10)}</td>
                        <td>{d.views}</td>
                        <td>{d.sessions}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
            <p className="form-note">
              A session ends after 30 minutes of inactivity. The tracker
              excludes admin/workspace routes and known bots, honours Do Not
              Track, stores referrer hostnames without URL queries, and reports
              a rolling 90-day history. Expired events are removed as new visits
              arrive. “New businesses” counts onboarding in this period; it is
              not an attributed conversion rate.
            </p>
          </>
        )}
        <p>
          <a
            className="text-button"
            href="https://search.google.com/search-console"
            target="_blank"
            rel="noreferrer"
          >
            Open Google Search Console for search impressions, clicks and
            indexing
          </a>
        </p>
        {message && (
          <p className="banner" role="status">
            {message}
          </p>
        )}
      </div>
    </section>
  );
}
