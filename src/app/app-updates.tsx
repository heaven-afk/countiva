"use client";
import { useEffect, useState } from "react";

export default function AppUpdates() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (
      process.env.NODE_ENV !== "production" ||
      !("serviceWorker" in navigator)
    )
      return;
    let disposed = false;
    let checking = false;
    // First-time installation should not interrupt onboarding.
    let hadController = Boolean(navigator.serviceWorker.controller);
    const changed = () => {
      if (hadController && !disposed) setReady(true);
      hadController = true;
    };
    const check = () => {
      if (document.visibilityState !== "visible" || !navigator.onLine) return;
      if (checking) return;
      checking = true;
      void fetch("/api/version", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (
            !disposed &&
            data?.version &&
            data.version !== process.env.NEXT_PUBLIC_APP_VERSION
          )
            setReady(true);
        })
        .catch(() => {})
        .finally(() => {
          checking = false;
        });
      void navigator.serviceWorker
        .register("/sw.js", { updateViaCache: "none" })
        .then((registration) => registration.update())
        .catch(() => {});
    };
    navigator.serviceWorker.addEventListener("controllerchange", changed);
    document.addEventListener("visibilitychange", check);
    window.addEventListener("online", check);
    check();
    const timer = window.setInterval(check, 60 * 60 * 1000);
    return () => {
      disposed = true;
      clearInterval(timer);
      navigator.serviceWorker.removeEventListener("controllerchange", changed);
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("online", check);
    };
  }, []);
  if (!ready) return null;
  return (
    <div className="app-update-notice" role="status">
      <span>
        A Countiva update is ready. Finish your current entry, then refresh.
      </span>
      <button
        type="button"
        className="button primary"
        onClick={() => window.location.reload()}
      >
        Refresh app
      </button>
      <button
        type="button"
        className="button secondary"
        onClick={() => setReady(false)}
      >
        Later
      </button>
    </div>
  );
}
