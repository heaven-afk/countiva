"use client";
import { useEffect, useState } from "react";
import { Bell, Check, Package, Users } from "lucide-react";
import { getSupabase } from "../lib/supabase";
import { money, paidFor, type State } from "../lib/domain";
import InstallPrompt from "./install-prompt";
import { useAppInstall } from "./app-install-provider";
function keyBytes(value: string) {
  const raw = atob(value.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}
export default function Notifications({
  businessId,
  ownerName,
  state,
  onNavigate,
}: {
  businessId: string;
  ownerName: string;
  state: State;
  onNavigate: (page: string) => void;
}) {
  const { isIOS, installed } = useAppInstall();
  const [prefs, setPrefs] = useState({
      enabled: false,
      morning: true,
      evening: true,
      morning_time: "08:00",
      evening_time: "20:00",
    }),
    [loaded, setLoaded] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  useEffect(() => {
    getSupabase()
      ?.rpc("get_notification_preferences", { bid: businessId })
      .then(({ data, error }) => {
        if (data) {
          setPrefs({
            ...data,
            morning_time: data.morning_time.slice(0, 5),
            evening_time: data.evening_time.slice(0, 5),
          });
          setLoaded(true);
        } else if (error)
          setMessage(
            "Reminder settings are not available yet. Please try again online.",
          );
      });
  }, [businessId]);
  const low = state.products.filter((p) => p.stock <= p.threshold),
    credit = state.sales.reduce(
      (sum, s) => sum + s.total - paidFor(state, s),
      0,
    );
  async function save() {
    setBusy(true);
    setMessage("");
    const client = getSupabase()!;
    try {
      let subscription: PushSubscription | null = null;
      if (prefs.enabled) {
        if (isIOS && !installed)
          throw new Error(
            "Add Countiva to your Home Screen and open it from that icon before enabling reminders on this iPhone or iPad.",
          );
        const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
        if (!publicKey)
          throw new Error(
            "Browser reminders are being configured. Your in-app stock and credit updates are available below.",
          );
        if (
          !("Notification" in window) ||
          !("serviceWorker" in navigator) ||
          !("PushManager" in window)
        )
          throw new Error(
            "This browser does not support reminders. You can still use your in-app updates.",
          );
        if (Notification.permission === "denied")
          throw new Error(
            "Browser notifications are blocked. Allow Countiva notifications in your browser settings, then try again.",
          );
        const permission = await Notification.requestPermission();
        if (permission !== "granted")
          throw new Error(
            "Notification permission was not granted. No reminders were enabled.",
          );
        const registration = await navigator.serviceWorker.register("/sw.js");
        await Promise.race([
          navigator.serviceWorker.ready,
          new Promise((_, reject) =>
            setTimeout(
              () =>
                reject(
                  new Error(
                    "The reminder service did not become ready. Reload and try again.",
                  ),
                ),
              10000,
            ),
          ),
        ]);
        subscription =
          (await registration.pushManager.getSubscription()) ||
          (await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: keyBytes(publicKey),
          }));
      }
      const saved = await client.rpc("save_notification_preferences", {
        bid: businessId,
        details: prefs,
      });
      if (saved.error) throw saved.error;
      if (subscription) {
        const json = subscription.toJSON();
        const registered = await client.rpc("save_push_subscription", {
          bid: businessId,
          details: {
            endpoint: subscription.endpoint,
            p256dh: json.keys?.p256dh,
            auth: json.keys?.auth,
          },
        });
        if (registered.error) {
          await client.rpc("save_notification_preferences", {
            bid: businessId,
            details: { ...prefs, enabled: false },
          });
          throw registered.error;
        }
      }
      setMessage(
        prefs.enabled
          ? "Reminder preferences saved for this business. Browser delivery depends on notification permission and your connection."
          : "Browser reminders are turned off for this business.",
      );
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="notifications-page">
      <InstallPrompt />
      <section className="panel reminder-settings">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">
              A LITTLE HELP WITH YOUR DAILY ROUTINE
            </span>
            <h2>Your reminders</h2>
            <p>
              Personalised stock reminders for{" "}
              {ownerName.trim().split(/\s+/)[0]}. Times use Africa/Lagos.
            </p>
          </div>
          <Bell size={24} />
        </div>
        <div className="reminder-settings-body">
          <label className="check-label">
            <input
              type="checkbox"
              checked={prefs.enabled}
              onChange={(e) =>
                setPrefs({ ...prefs, enabled: e.target.checked })
              }
            />
            Enable browser reminders for this business
          </label>
          <div className="form-grid">
            <div>
              <label className="check-label">
                <input
                  type="checkbox"
                  checked={prefs.morning}
                  onChange={(e) =>
                    setPrefs({ ...prefs, morning: e.target.checked })
                  }
                />
                Good morning stock reminder
              </label>
              <label>
                Morning time
                <input
                  type="time"
                  value={prefs.morning_time}
                  onChange={(e) =>
                    setPrefs({ ...prefs, morning_time: e.target.value })
                  }
                />
              </label>
              <small>
                “Good morning, {ownerName.trim().split(/\s+/)[0]}. Remember to
                check today’s stock.”
              </small>
            </div>
            <div>
              <label className="check-label">
                <input
                  type="checkbox"
                  checked={prefs.evening}
                  onChange={(e) =>
                    setPrefs({ ...prefs, evening: e.target.checked })
                  }
                />
                End-of-day reminder
              </label>
              <label>
                Evening time
                <input
                  type="time"
                  value={prefs.evening_time}
                  onChange={(e) =>
                    setPrefs({ ...prefs, evening_time: e.target.value })
                  }
                />
              </label>
              <small>
                Sent only when no online stock or sales updates have been saved
                for the business that day.
              </small>
            </div>
          </div>
          <p className="form-note">
            Reminders arrive around the chosen time. On iPhone or iPad, add
            Countiva to the Home Screen before enabling browser notifications.
            Turning reminders off stops future sends for this business.
          </p>
          <button
            className="button primary"
            disabled={
              busy || !loaded || !prefs.morning_time || !prefs.evening_time
            }
            onClick={() => void save()}
          >
            {busy ? "Saving…" : "Save reminder preferences"}
          </button>
          {message && (
            <p className="banner" role="status">
              {message}
            </p>
          )}
        </div>
      </section>
      <section className="panel">
        <div className="panel-heading">
          <h2>Business updates</h2>
          <small>Based on the records on this device</small>
        </div>
        <div className="business-notices">
          {low.length ? (
            <button onClick={() => onNavigate("Inventory")}>
              <Package size={23} />
              <span>
                <strong>{low.length} products need a stock check</strong>
                <small>
                  {low
                    .slice(0, 3)
                    .map((p) => p.name)
                    .join(" · ")}
                </small>
              </span>
            </button>
          ) : (
            <div>
              <Check size={23} />
              <span>
                <strong>Your stock alerts are clear</strong>
                <small>No products are at or below their alert levels.</small>
              </span>
            </div>
          )}
          {credit > 0 && (
            <button onClick={() => onNavigate("Customers & credit")}>
              <Users size={23} />
              <span>
                <strong>{money(credit)} in customer balances</strong>
                <small>
                  Review unpaid and part-paid sales before extending more
                  credit.
                </small>
              </span>
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
