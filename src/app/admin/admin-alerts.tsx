"use client";
import { useEffect, useState } from "react";
import { Bell, Download, TrendingUp, Banknote } from "lucide-react";
import { paymentDate, paymentRpc } from "../../lib/manual-payments";
import { useAppInstall } from "../app-install-provider";
import type useAdminAlerts from "./use-admin-alerts";
import type { AlertPreferences } from "./use-admin-alerts";
import Skeleton from "../skeleton";
export default function AdminAlerts({
  inbox,
  onPayments,
}: {
  inbox: ReturnType<typeof useAdminAlerts>;
  onPayments: () => void;
}) {
  const [prefs, setPrefs] = useState<AlertPreferences>({
    transfers: true,
    spikes: true,
    push_enabled: false,
  });
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState("");
  const install = useAppInstall();
  useEffect(() => {
    if (inbox.data) setPrefs(inbox.data.preferences);
  }, [
    inbox.data?.preferences.transfers,
    inbox.data?.preferences.spikes,
    inbox.data?.preferences.push_enabled,
  ]);
  async function save() {
    await paymentRpc("save_platform_notification_preferences", {
      transfer_alerts: prefs.transfers,
      spike_alerts: prefs.spikes,
      push_delivery: prefs.push_enabled,
    });
  }
  async function savePreferences(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await save();
      await inbox.load();
      setMessage(
        prefs.push_enabled
          ? "Preferences saved. Connect this device below to receive push alerts."
          : "Preferences saved. Push delivery is off; your dashboard inbox remains available.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function connect() {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      if (install.isIOS && !install.installed)
        throw new Error(
          "Add Countiva Admin to your Home Screen, then open it there to enable iPhone notifications.",
        );
      if (
        !("Notification" in window) ||
        !("serviceWorker" in navigator) ||
        !("PushManager" in window)
      )
        throw new Error(
          "This browser does not support push notifications. Your admin inbox still works.",
        );
      const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!key)
        throw new Error(
          "The push service is not configured. Your admin inbox still works.",
        );
      const permission =
        Notification.permission === "granted"
          ? "granted"
          : await Notification.requestPermission();
      if (permission !== "granted")
        throw new Error(
          "Allow notifications for Countiva in your browser settings, then try again.",
        );
      await save();
      await navigator.serviceWorker.register("/sw.js");
      const registration = await Promise.race([
        navigator.serviceWorker.ready,
        new Promise<never>((_, reject) =>
          setTimeout(
            () =>
              reject(
                new Error("Notification setup took too long. Please retry."),
              ),
            12000,
          ),
        ),
      ]);
      const bytes = Uint8Array.from(
        atob(key.replace(/-/g, "+").replace(/_/g, "/")),
        (c) => c.charCodeAt(0),
      );
      const subscription =
        (await registration.pushManager.getSubscription()) ||
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: bytes,
        }));
      const details = subscription.toJSON();
      await paymentRpc("save_platform_push_subscription", {
        details: {
          endpoint: subscription.endpoint,
          p256dh: details.keys?.p256dh,
          auth: details.keys?.auth,
        },
      });
      await inbox.load();
      setMessage(
        "This device is connected for admin push alerts. Background delivery follows the configured notification scheduler.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel admin-operations" id="admin-alerts">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">STAY INFORMED</span>
          <h2>Admin notifications</h2>
          <p>Transfer submissions and changes in platform activity.</p>
        </div>
        <Bell size={24} />
      </div>
      <div className="admin-operations-body">
        {(error || inbox.error) && (
          <p className="banner error" role="alert">
            {error || inbox.error}
          </p>
        )}
        {message && (
          <p className="banner" role="status">
            {message}
          </p>
        )}
        {!inbox.data && !inbox.error ? (
          <Skeleton label="Loading admin notifications" />
        ) : (
          <>
            <form className="admin-alert-settings" onSubmit={savePreferences}>
              <h3>Notification preferences</h3>
              <label className="transfer-checkbox">
                <input
                  type="checkbox"
                  checked={prefs.transfers}
                  onChange={(e) =>
                    setPrefs({ ...prefs, transfers: e.target.checked })
                  }
                />{" "}
                Transfer submissions
              </label>
              <label className="transfer-checkbox">
                <input
                  type="checkbox"
                  checked={prefs.spikes}
                  onChange={(e) =>
                    setPrefs({ ...prefs, spikes: e.target.checked })
                  }
                />{" "}
                Activity spikes
              </label>
              <label className="transfer-checkbox">
                <input
                  type="checkbox"
                  checked={prefs.push_enabled}
                  onChange={(e) =>
                    setPrefs({ ...prefs, push_enabled: e.target.checked })
                  }
                />{" "}
                Send browser / Home Screen push alerts
              </label>
              <p>
                Spikes compare the last 24 hours with the previous seven-day
                daily average. Alerts require at least 3× that average and a
                minimum of 20 page views, 5 new businesses or 50 scans. Each
                metric alerts at most once per Lagos day. These are signals to
                investigate, not proof of a problem.
              </p>
              <div className="transfer-actions">
                <button
                  className="button primary"
                  disabled={busy || !inbox.data}
                >
                  Save preferences
                </button>
                <button
                  type="button"
                  className="button secondary"
                  disabled={busy || !prefs.push_enabled || !inbox.data}
                  onClick={() => void connect()}
                >
                  <Bell size={16} /> Connect this device
                </button>
                {install.ready && !install.installed && (
                  <button
                    type="button"
                    className="button secondary"
                    onClick={async () => {
                      const result = await install.install();
                      if (result === "instructions")
                        setMessage(
                          install.isIOS
                            ? "In Safari, open Share, choose Add to Home Screen, then Add. Open the Countiva Admin icon to connect notifications."
                            : "Use your browser’s Install app or Add to Home Screen menu while on this admin page.",
                        );
                    }}
                  >
                    <Download size={16} /> Install Admin
                  </button>
                )}
              </div>
            </form>
            <div className="admin-alert-list">
              {inbox.data?.alerts.map((alert) => (
                <article
                  key={alert.id}
                  className={`admin-alert ${alert.read_at ? "" : "unread"}`}
                >
                  <span className="admin-payment-icon">
                    {alert.kind === "transfer" ? (
                      <Banknote size={20} />
                    ) : (
                      <TrendingUp size={20} />
                    )}
                  </span>
                  <div>
                    <span className="eyebrow">
                      {alert.read_at ? "UPDATE" : "NEW UPDATE"}
                    </span>
                    <h3>{alert.title}</h3>
                    <p>{alert.body}</p>
                    <small>{paymentDate(alert.created_at)} · Lagos</small>
                    <div className="transfer-actions">
                      {alert.kind === "transfer" && (
                        <button
                          className="button secondary"
                          onClick={onPayments}
                        >
                          Review transfers
                        </button>
                      )}
                      {!alert.read_at && (
                        <button
                          className="text-button"
                          onClick={async () => {
                            try {
                              await inbox.markRead(alert.id);
                            } catch (e) {
                              setError((e as Error).message);
                            }
                          }}
                        >
                          Mark as read
                        </button>
                      )}
                    </div>
                  </div>
                </article>
              ))}
              {inbox.data && !inbox.data.alerts.length && (
                <div className="admin-empty">
                  <Bell size={28} />
                  <h3>No notifications yet.</h3>
                  <p>Your latest 30 days of admin alerts will appear here.</p>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
