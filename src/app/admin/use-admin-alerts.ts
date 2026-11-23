"use client";
import { useEffect, useRef, useState } from "react";
import { paymentRpc } from "../../lib/manual-payments";
export type AdminAlert = {
  id: string;
  kind: string;
  title: string;
  body: string;
  created_at: string;
  read_at: string | null;
};
export type AlertPreferences = {
  transfers: boolean;
  spikes: boolean;
  push_enabled: boolean;
};
export type AlertInbox = {
  unreadCount: number;
  alerts: AdminAlert[];
  preferences: AlertPreferences;
};
export default function useAdminAlerts(enabled: boolean) {
  const [data, setData] = useState<AlertInbox | null>(null),
    [error, setError] = useState("");
  const revision = useRef(0);
  async function load() {
    if (!enabled) return;
    const current = ++revision.current;
    try {
      const result = await paymentRpc<AlertInbox>("platform_alert_inbox");
      if (current === revision.current) {
        setData(result);
        setError("");
      }
    } catch (e) {
      if (current === revision.current) setError((e as Error).message);
    }
  }
  useEffect(() => {
    if (!enabled) {
      setData(null);
      setError("");
      return;
    }
    void load();
    const refresh = () => {
      if (document.visibilityState === "visible") void load();
    };
    const timer = setInterval(refresh, 30000);
    window.addEventListener("focus", refresh);
    return () => {
      revision.current++;
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, [enabled]);
  async function markRead(id: string) {
    await paymentRpc("read_platform_alert", { alert_ref: id });
    await load();
  }
  return { data, error, load, markRead };
}
