"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { getSupabase } from "../lib/supabase";
import type { NotificationInbox } from "../lib/business-notifications";

export default function useBusinessNotifications(businessId: string) {
  const [inbox, setInbox] = useState<NotificationInbox>({
    notifications: [],
    unreadCount: 0,
  });
  const [loaded, setLoaded] = useState(false),
    [error, setError] = useState("");
  const [reading, setReading] = useState<string | null>(null);
  const generation = useRef(0),
    readLock = useRef(false);
  const reload = useCallback(async () => {
    if (!navigator.onLine) {
      setLoaded(true);
      setError("Connect to the internet to check account updates.");
      return;
    }
    const client = getSupabase();
    if (!client) {
      setLoaded(true);
      setError("Account services are unavailable. Please try again later.");
      return;
    }
    const revision = ++generation.current;
    try {
      const result = await client.rpc("list_business_notifications", {
        bid: businessId,
      });
      if (revision !== generation.current) return;
      if (result.error) throw result.error;
      setInbox(result.data);
      setError("");
    } catch {
      if (revision === generation.current)
        setError(
          "Account notifications are unavailable. Check your connection or ask Countiva support to enable them.",
        );
    } finally {
      if (revision === generation.current) setLoaded(true);
    }
  }, [businessId]);
  useEffect(() => {
    const refresh = () => {
      if (!document.hidden) void reload();
    };
    refresh();
    window.addEventListener("focus", refresh);
    window.addEventListener("online", refresh);
    document.addEventListener("visibilitychange", refresh);
    const timer = setInterval(refresh, 60000);
    return () => {
      generation.current++;
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("online", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [reload]);
  async function markRead(id: string) {
    if (readLock.current) return;
    readLock.current = true;
    setReading(id);
    try {
      const client = getSupabase();
      if (!client || !navigator.onLine) throw new Error();
      const result = await client.rpc("read_business_notification", {
        bid: businessId,
        notification_ref: id,
      });
      if (result.error) throw result.error;
      // Discard any older inbox fetch that started before the acknowledgement.
      generation.current++;
      setInbox((current) => ({
        notifications: current.notifications.map((item) =>
          item.id === id
            ? { ...item, readAt: item.readAt || new Date().toISOString() }
            : item,
        ),
        unreadCount: Math.max(
          0,
          current.unreadCount -
            (current.notifications.some(
              (item) => item.id === id && !item.readAt,
            )
              ? 1
              : 0),
        ),
      }));
      setError("");
      void reload();
    } catch {
      setError(
        "Could not mark this notification as read. Reconnect and try again.",
      );
    } finally {
      readLock.current = false;
      setReading(null);
    }
  }
  return { ...inbox, loaded, error, reading, markRead, reload };
}
export type BusinessInbox = ReturnType<typeof useBusinessNotifications>;
