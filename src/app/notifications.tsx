"use client";
import { useEffect, useState } from "react";
import { Bell, Check, Package, Users } from "lucide-react";
import { getSupabase } from "../lib/supabase";
import { money, paidFor, type State } from "../lib/domain";
import InstallPrompt from "./install-prompt";
import { useAppInstall } from "./app-install-provider";
import type { BusinessInbox } from "./use-business-notifications";
import TrialNotification from "./trial-notification";
import Skeleton from "./skeleton";
function keyBytes(value: string) {
  const raw = atob(value.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}
export default function Notifications({
  businessId,
  ownerName,
  state,
  onNavigate,
  inbox,
}: {
  businessId: string;
  ownerName: string;
  state: State;
  onNavigate: (page: string) => void;
  inbox: BusinessInbox;
}) {
  const { isIOS, installed } = useAppInstall();
  const [prefs, setPrefs] = useState({
    enabled: false,
    morning: true,
    evening: true,
    morning_time: "08:00",
    evening_time: "20:00",
  });
  const [loaded, setLoaded] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [loadError, setLoadError] = useState("");
  const [savedEnabled, setSavedEnabled] = useState(false);
  const [busy, setBusy] = useState<"save" | "connect" | null>(null);
  const [message, setMessage] = useState<{
    text: string;
    error?: boolean;
  } | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    setLoaded(false);
    setLoadError("");
    setSavedEnabled(false);
    setMessage(null);
    async function load() {
      const client = getSupabase();
      try {
        if (!client) throw new Error();
        const { data, error } = await client
          .rpc("get_notification_preferences", { bid: businessId })
          .abortSignal(
            AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]),
          );
        if (controller.signal.aborted) return;
        if (error || !data) throw new Error();
        const { enabled, morning, evening, morning_time, evening_time } = data;
        setPrefs({
          enabled,
          morning,
          evening,
          morning_time: morning_time.slice(0, 5),
          evening_time: evening_time.slice(0, 5),
        });
        setSavedEnabled(enabled);
        setLoaded(true);
      } catch {
        if (!controller.signal.aborted)
          setLoadError(
            "Couldn’t load reminder preferences. Check your connection and try again.",
          );
      }
    }
    void load();
    return () => controller.abort();
  }, [businessId, loadAttempt]);
  const low = state.products.filter((p) => p.stock <= p.threshold),
    credit = state.sales.reduce(
      (sum, s) => sum + s.total - paidFor(state, s),
      0,
    );

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!loaded || busy) return;
    setBusy("save");
    setMessage(null);
    try {
      if (prefs.enabled && !prefs.morning && !prefs.evening)
        throw new Error("Choose at least one reminder, or turn reminders off.");
      const client = getSupabase();
      if (!client || !navigator.onLine)
        throw new Error(
          "Connect to the internet to save your reminder preferences.",
        );
      const details = {
        ...prefs,
        morning_time: prefs.morning_time || "08:00",
        evening_time: prefs.evening_time || "20:00",
      };
      const saved = await client
        .rpc("save_notification_preferences", { bid: businessId, details })
        .abortSignal(AbortSignal.timeout(15000));
      if (saved.error)
        throw new Error(
          "Couldn’t save reminder preferences. Check your connection and try again.",
        );
      setPrefs(details);
      setSavedEnabled(details.enabled);
      setMessage({
        text: details.enabled
          ? "Reminder schedule saved. Connect this device if you haven’t set up notifications here."
          : "Reminders are turned off for this business.",
      });
    } catch (error) {
      setMessage({
        text:
          error instanceof Error
            ? error.message
            : "Couldn’t save reminder preferences.",
        error: true,
      });
    } finally {
      setBusy(null);
    }
  }

  async function connectDevice() {
    if (!savedEnabled || !prefs.enabled || busy) return;
    setBusy("connect");
    setMessage(null);
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const client = getSupabase();
      if (!client || !navigator.onLine)
        throw new Error("Connect to the internet to set up notifications.");
      if (isIOS && !installed)
        throw new Error(
          "Open Countiva from its Home Screen icon to connect this device.",
        );
      const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!publicKey)
        throw new Error(
          "Browser delivery is unavailable until Countiva’s push service is configured.",
        );
      if (
        !("Notification" in window) ||
        !("serviceWorker" in navigator) ||
        !("PushManager" in window)
      )
        throw new Error("This browser does not support push reminders.");
      if (Notification.permission === "denied")
        throw new Error(
          "Allow Countiva notifications in your browser settings and try again.",
        );
      const permission =
        Notification.permission === "granted"
          ? "granted"
          : await Notification.requestPermission();
      if (permission !== "granted")
        throw new Error("Notification permission was not granted.");
      const registration = await Promise.race([
        navigator.serviceWorker
          .register("/sw.js")
          .then(() => navigator.serviceWorker.ready),
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () =>
              reject(
                new Error(
                  "The notification service is taking too long to start. Try again.",
                ),
              ),
            12000,
          );
        }),
      ]);
      const subscription =
        (await registration.pushManager.getSubscription()) ||
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: keyBytes(publicKey),
        }));
      const { keys } = subscription.toJSON();
      const registered = await client
        .rpc("save_push_subscription", {
          bid: businessId,
          details: {
            endpoint: subscription.endpoint,
            p256dh: keys?.p256dh,
            auth: keys?.auth,
          },
        })
        .abortSignal(AbortSignal.timeout(15000));
      if (registered.error) throw new Error(registered.error.message);
      setMessage({ text: "This device is connected for browser reminders." });
    } catch (error) {
      setMessage({
        text:
          error instanceof Error
            ? error.message
            : "Couldn’t connect this device. Try again.",
        error: true,
      });
    } finally {
      clearTimeout(timer);
      setBusy(null);
    }
  }
  return (
    <div className="notifications-page">
      <section className="panel account-notifications">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">YOUR ACCOUNT</span>
            <h2>Account updates</h2>
            <p>Trial notifications stay here after you’ve read them.</p>
          </div>
          <button
            type="button"
            className="button secondary"
            onClick={() => void inbox.reload()}
          >
            Refresh updates
          </button>
        </div>
        {inbox.error && (
          <p className="banner" role="alert">
            {inbox.error}
          </p>
        )}
        {!inbox.loaded ? (
          <Skeleton compact label="Loading account updates" />
        ) : inbox.notifications.length ? (
          <div className="account-notification-list">
            {inbox.notifications.map((item) => (
              <TrialNotification
                key={item.id}
                item={item}
                reading={inbox.reading === item.id}
                onRead={() => void inbox.markRead(item.id)}
                onView={() => onNavigate("Subscription")}
              />
            ))}
          </div>
        ) : (
          !inbox.error && (
            <p className="notification-empty">
              You’re all caught up. New account updates will appear here.
            </p>
          )
        )}
      </section>
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
        {loadError ? (
          <div className="reminder-settings-body">
            <p className="banner" role="alert">
              {loadError}
            </p>
            <button
              type="button"
              className="button secondary"
              onClick={() => setLoadAttempt((attempt) => attempt + 1)}
            >
              Retry loading preferences
            </button>
          </div>
        ) : !loaded ? (
          <Skeleton compact label="Loading reminder preferences" />
        ) : (
          <form className="reminder-settings-body" onSubmit={save}>
            <fieldset disabled={Boolean(busy)}>
              <label className="check-label">
                <input
                  type="checkbox"
                  checked={prefs.enabled}
                  onChange={(e) =>
                    setPrefs({ ...prefs, enabled: e.target.checked })
                  }
                />
                Turn on reminders for this business
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
                      required={prefs.enabled && prefs.morning}
                      value={prefs.morning_time}
                      onChange={(e) =>
                        setPrefs({ ...prefs, morning_time: e.target.value })
                      }
                    />
                  </label>
                  <small>
                    “Good morning, {ownerName.trim().split(/\s+/)[0]}. Remember
                    to check today’s stock.”
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
                      required={prefs.enabled && prefs.evening}
                      value={prefs.evening_time}
                      onChange={(e) =>
                        setPrefs({ ...prefs, evening_time: e.target.value })
                      }
                    />
                  </label>
                  <small>
                    Sent only when no online stock or sales updates have been
                    saved for the business that day.
                  </small>
                </div>
              </div>
              <p className="form-note">
                Reminders arrive around the chosen time. On iPhone or iPad, add
                Countiva to the Home Screen before enabling browser
                notifications. Turning reminders off stops future sends for this
                business.
              </p>
              <div className="reminder-actions">
                <button type="submit" className="button primary">
                  {busy === "save" ? "Saving…" : "Save reminder preferences"}
                </button>
                {savedEnabled && prefs.enabled && (
                  <button
                    type="button"
                    className="button secondary"
                    onClick={() => void connectDevice()}
                  >
                    {busy === "connect" ? "Connecting…" : "Connect this device"}
                  </button>
                )}
              </div>
            </fieldset>
            {message && (
              <p className="banner" role={message.error ? "alert" : "status"}>
                {message.text}
              </p>
            )}
          </form>
        )}
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
