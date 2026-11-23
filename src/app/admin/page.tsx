"use client";
import AdminBrand from "./admin-brand";
import AdminNavigation, {
  adminSections,
  type AdminSection,
} from "./admin-navigation";
import AdminManualPayments from "./manual-payments";
import AdminAlerts from "./admin-alerts";
import useAdminAlerts from "./use-admin-alerts";
import { paymentRpc } from "../../lib/manual-payments";
import ThemeControl from "../theme-control";
import Skeleton from "../skeleton";
import AdminSubscriptions from "./subscription-management";
import AdminPlanSettings from "./plan-settings";
import AdminBusinessViewer from "./business-viewer";
import TrafficPanel from "./traffic-panel";
import ServiceHealth from "./service-health";
import { useEffect, useState, useRef } from "react";
import {
  Building2,
  Users,
  Activity,
  Camera,
  RefreshCw,
  ShieldCheck,
  LogOut,
  Bell,
  Banknote,
  ArrowRight,
} from "lucide-react";
import { getSupabase } from "../../lib/supabase";
import { setStorageScope } from "../../lib/storage";
import type { PlatformDashboard, PlatformRole } from "../../lib/contracts";
export default function Admin() {
  const [role, setRole] = useState<PlatformRole | null>(null),
    [data, setData] = useState<PlatformDashboard | null>(null),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(true),
    [signedIn, setSignedIn] = useState(false);
  const [inspection, setInspection] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const client = getSupabase();
  const [section, setSection] = useState<AdminSection>("overview");
  const reviewer = role === "owner" || role === "admin";
  const inbox = useAdminAlerts(reviewer && signedIn);
  function navigate(value: AdminSection) {
    setSection(value);
    window.history.replaceState(null, "", `/admin#${value}`);
    window.scrollTo({ top: 0, behavior: "instant" });
  }
  useEffect(() => {
    const read = () => {
      const value = window.location.hash.slice(1);
      if (adminSections.some((item) => item.id === value))
        setSection(value as AdminSection);
    };
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, []);
  const generation = useRef(0);
  const signingOut = useRef(false);
  const [loggingOut, setLoggingOut] = useState(false);
  async function load() {
    if (signingOut.current) return;
    const revision = ++generation.current;
    setBusy(true);
    setMessage("");
    try {
      if (!navigator.onLine)
        throw new Error(
          "Connect to the internet to monitor current platform activity.",
        );
      if (!client) throw new Error("The account service is not connected.");
      const {
        data: { session },
      } = await client.auth.getSession();
      if (revision !== generation.current) return;
      setSignedIn(Boolean(session));
      if (!session) {
        setRole(null);
        return;
      }
      const access = await client.rpc("platform_access");
      if (revision !== generation.current) return;
      if (access.error || !access.data) {
        setRole(null);
        throw new Error("This account does not have Countiva platform access.");
      }
      setRole(access.data);
      const result = await client.rpc("platform_dashboard");
      if (revision !== generation.current) return;
      if (result.error) throw result.error;
      setData(result.data);
    } catch (e) {
      if (revision !== generation.current) return;
      setData(null);
      setMessage((e as Error).message);
    } finally {
      if (revision === generation.current) setBusy(false);
    }
  }
  useEffect(() => {
    load();
    const { data } = client?.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT" || event === "SIGNED_IN") {
        generation.current++;
        setData(null);
        setRole(null);
        setSignedIn(event === "SIGNED_IN");
        if (event === "SIGNED_IN") setTimeout(() => load(), 0);
      }
    }) || { data: null };
    const refresh = () => {
      load();
    };
    const offline = () => {
      generation.current++;
      setData(null);
      setRole(null);
      setMessage(
        "Connect to the internet to monitor current platform activity.",
      );
    };
    window.addEventListener("focus", refresh);
    window.addEventListener("online", refresh);
    window.addEventListener("offline", offline);
    const timer = setInterval(refresh, 60000);
    return () => {
      generation.current++;
      data?.subscription.unsubscribe();
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("online", refresh);
      window.removeEventListener("offline", offline);
    };
  }, [client]);
  async function signOut() {
    if (!client || signingOut.current) return;
    signingOut.current = true;
    setLoggingOut(true);
    generation.current++;
    setData(null);
    setRole(null);
    setBusy(false);
    setMessage("");
    try {
      if ("serviceWorker" in navigator) {
        try {
          const registration = await navigator.serviceWorker.getRegistration();
          const subscription =
            await registration?.pushManager.getSubscription();
          if (subscription)
            await paymentRpc("remove_platform_push_subscription", {
              device_endpoint: subscription.endpoint,
            });
        } catch {
          /* Sign-out must remain available even if device removal cannot connect. */
        }
      }
      const { error } = await client.auth.signOut({ scope: "local" });
      if (error) throw error;
      localStorage.removeItem("shopilot-authorised-business-v1");
      setStorageScope(null);
      setSignedIn(false);
      window.location.assign("/admin/login");
    } catch {
      setMessage("Could not sign out. Please try again.");
      signingOut.current = false;
      setLoggingOut(false);
    }
  }
  async function access(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!client) return;
    const form = new FormData(event.currentTarget);
    setBusy(true);
    try {
      const result = await client.rpc("set_platform_access", {
        target_email: String(form.get("email")),
        access_role: String(form.get("role")),
      });
      if (result.error) throw result.error;
      await load();
      setMessage("Platform access updated.");
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main
      className={`platform-admin admin-console ${role && data ? "admin-authorised" : ""}`}
    >
      <div className="platform-brand-bar">
        <AdminBrand />
        <div className="admin-top-actions">
          {reviewer && (
            <button
              className="admin-bell"
              aria-label={`Notifications${inbox.data?.unreadCount ? `, ${inbox.data.unreadCount} unread` : ""}`}
              onClick={() => navigate("alerts")}
            >
              <Bell size={21} />
              {!!inbox.data?.unreadCount && (
                <span>{Math.min(inbox.data.unreadCount, 99)}</span>
              )}
            </button>
          )}
          <ThemeControl compact />
          {signedIn && (
            <button
              className="button secondary admin-signout"
              onClick={signOut}
              disabled={loggingOut}
            >
              <LogOut size={17} />
              <span>{loggingOut ? "Signing out…" : "Sign out"}</span>
            </button>
          )}
        </div>
      </div>
      {role && data && (
        <AdminNavigation
          section={section}
          onChange={navigate}
          unread={inbox.data?.unreadCount || 0}
          reviewer={reviewer}
        />
      )}
      <div className="admin-console-content">
        <header className="platform-heading">
          <div>
            <span className="eyebrow">
              COUNTIVA ADMIN · {role || "PRIVATE OPERATIONS"}
            </span>
            <h1>
              {section === "overview"
                ? "Your operations, in view."
                : adminSections.find((item) => item.id === section)?.label}
            </h1>
            <p>
              {section === "overview"
                ? "A little clarity. A better next decision."
                : "Manage Countiva with a clear record of every action."}
            </p>
          </div>
          <div className="platform-heading-actions">
            <span className="admin-live-label">
              <i /> Private workspace
            </span>
          </div>
        </header>
        {message && (
          <div className="banner" role="status">
            {message}
          </div>
        )}
        {busy && !data ? (
          <Skeleton label="Checking platform access" />
        ) : !role || !data ? (
          <section className="panel settings-panel">
            <ShieldCheck size={28} />
            <h2>Private platform area</h2>
            <p>
              Only accounts explicitly authorised by the Countiva platform owner
              can access this dashboard. A business owner account does not
              automatically have platform access.
            </p>
            {!signedIn && (
              <a className="button primary" href="/admin/login">
                Sign in to continue
              </a>
            )}
            <button className="button secondary" onClick={load}>
              Check access again
            </button>
          </section>
        ) : (
          <>
            {section === "overview" && (
              <>
                <div className="platform-toolbar" id="admin-overview">
                  <span>
                    Access: {role} · Database activity, not server uptime
                  </span>
                  <button
                    className="button secondary"
                    disabled={busy}
                    onClick={load}
                  >
                    <RefreshCw size={16} /> Refresh
                  </button>
                </div>
                <div className="stats">
                  {[
                    {
                      label: "Businesses",
                      value: data.businessCount,
                      Icon: Building2,
                    },
                    {
                      label: "Registered accounts",
                      value: data.accountCount,
                      Icon: Users,
                    },
                    {
                      label: "Active businesses · 24h",
                      value: data.activeBusinesses,
                      Icon: Activity,
                    },
                    {
                      label: "Scans today",
                      value: data.scansToday,
                      Icon: Camera,
                    },
                  ].map(({ label, value, Icon }) => (
                    <section className="stat" key={label}>
                      <div className="stat-label">
                        {label}
                        <Icon size={18} />
                      </div>
                      <div className="stat-value">{value}</div>
                    </section>
                  ))}
                </div>
                <div className="admin-overview-grid">
                  <section className="admin-command-card">
                    <span className="eyebrow">KEEP BUSINESS MOVING</span>
                    <h2>Every payment deserves a clear answer.</h2>
                    <p>
                      Review transfer details, confirm the bank credit and give
                      your customers the access they paid for.
                    </p>
                    {reviewer && (
                      <button
                        className="button primary"
                        onClick={() => navigate("payments")}
                      >
                        <Banknote size={18} /> Review bank transfers{" "}
                        <ArrowRight size={17} />
                      </button>
                    )}
                  </section>
                  <section className="panel admin-overview-alerts">
                    <h2>Latest updates</h2>
                    {inbox.error && (
                      <p className="banner error" role="alert">
                        {inbox.error}
                      </p>
                    )}
                    {inbox.data?.alerts.slice(0, 3).map((item) => (
                      <button
                        key={item.id}
                        onClick={() =>
                          navigate(
                            item.kind === "transfer" ? "payments" : "alerts",
                          )
                        }
                      >
                        <span className="admin-payment-icon">
                          {item.kind === "transfer" ? (
                            <Banknote size={18} />
                          ) : (
                            <Activity size={18} />
                          )}
                        </span>
                        <span>
                          <strong>{item.title}</strong>
                          <small>
                            {new Date(item.created_at).toLocaleDateString(
                              "en-NG",
                              { timeZone: "Africa/Lagos" },
                            )}
                          </small>
                        </span>
                        <ArrowRight size={16} />
                      </button>
                    ))}
                    {!inbox.data?.alerts.length && !inbox.error && (
                      <p>
                        New transfer submissions and activity alerts will appear
                        here.
                      </p>
                    )}
                    {reviewer && (
                      <button
                        className="text-button"
                        onClick={() => navigate("alerts")}
                      >
                        Open notification centre <ArrowRight size={16} />
                      </button>
                    )}
                  </section>
                </div>
              </>
            )}
            {section === "payments" &&
              (reviewer ? (
                <AdminManualPayments
                  onChanged={() => {
                    void load();
                    void inbox.load();
                  }}
                />
              ) : (
                <p className="banner error" role="alert">
                  Payment review requires platform owner or administrator
                  access.
                </p>
              ))}
            {section === "alerts" && reviewer && (
              <AdminAlerts
                inbox={inbox}
                onPayments={() => navigate("payments")}
              />
            )}
            {section === "subscriptions" && (
              <AdminSubscriptions role={role} onChanged={load} />
            )}
            {section === "plans" && <AdminPlanSettings role={role} />}
            {section === "services" && <ServiceHealth role={role} />}
            {section === "traffic" && <TrafficPanel />}
            {section === "support" && (
              <AdminBusinessViewer
                role={role}
                target={inspection}
                onDeleted={() => {
                  setInspection(null);
                  void load();
                }}
              />
            )}
            {section === "businesses" && (
              <section
                className="panel"
                id="admin-businesses"
                aria-labelledby="admin-businesses-title"
              >
                <div className="panel-heading">
                  <div>
                    <h2 id="admin-businesses-title">Business activity</h2>
                    <p>
                      {data.staffCount} staff memberships · {data.salesCount}{" "}
                      recorded sales. Latest 200 businesses.
                    </p>
                  </div>
                </div>
                <div className="table-wrap">
                  <table className="admin-responsive-table">
                    <thead>
                      <tr>
                        <th>Business</th>
                        <th>Owner</th>
                        <th>Members</th>
                        <th>Sales</th>
                        <th>Last successful save</th>
                        <th>Workspace</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.businesses.map((b) => (
                        <tr key={b.id}>
                          <td data-label="Business">
                            <strong>{b.name}</strong>
                            <small>{b.business_type}</small>
                          </td>
                          <td data-label="Owner">{b.owner_email}</td>
                          <td data-label="Members">{b.members}</td>
                          <td data-label="Sales">{b.sales}</td>
                          <td data-label="Last successful save">
                            {b.last_synced_at
                              ? new Date(b.last_synced_at).toLocaleString(
                                  "en-NG",
                                  {
                                    timeZone: "Africa/Lagos",
                                  },
                                )
                              : "No save recorded yet"}
                          </td>
                          <td data-label="Workspace">
                            <button
                              className="button secondary"
                              disabled={role === "viewer"}
                              onClick={() => {
                                setInspection({ id: b.id, name: b.name });
                                navigate("support");
                              }}
                            >
                              View business
                            </button>
                          </td>
                        </tr>
                      ))}
                      {!data.businesses.length && (
                        <tr>
                          <td colSpan={6}>No businesses registered yet.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            )}
            {section === "access" && (
              <section
                className="panel settings-panel"
                id="admin-access"
                aria-labelledby="admin-access-title"
              >
                <h2 id="admin-access-title">Platform access</h2>
                <p>
                  Owner access can grant or remove other administrators.
                  Platform owners and admins can manage subscriptions; viewers
                  can monitor activity. Business detail inspection uses a
                  separate read-only, audited support view under the
                  administrator’s own identity.
                </p>
                {data.administrators.map((a) => (
                  <div className="team-row" key={a.userId}>
                    <span>{a.email}</span>
                    <strong>{a.role}</strong>
                  </div>
                ))}
                {role === "owner" && (
                  <form onSubmit={access} className="settings-form">
                    <label>
                      Registered, confirmed email
                      <input
                        name="email"
                        type="email"
                        required
                        autoComplete="off"
                      />
                    </label>
                    <label>
                      Access
                      <select name="role">
                        <option value="viewer">Viewer</option>
                        <option value="admin">Administrator</option>
                        <option value="owner">Platform owner</option>
                        <option value="remove">Remove platform access</option>
                      </select>
                    </label>
                    <button className="button primary" disabled={busy}>
                      Update platform access
                    </button>
                  </form>
                )}
                <h3>Recent access changes</h3>
                {data.audit.map((entry, index) => (
                  <p key={index}>
                    {entry.action.replaceAll("_", " ")} · {entry.actor_email} →{" "}
                    {entry.target_email} ·{" "}
                    {new Date(entry.created_at).toLocaleString("en-NG", {
                      timeZone: "Africa/Lagos",
                    })}
                  </p>
                ))}
              </section>
            )}
          </>
        )}
      </div>
    </main>
  );
}
