"use client";
import { useCallback, useEffect, useState } from "react";
import { getSupabase } from "../lib/supabase";
import type { Entitlements } from "../lib/plans";

export default function useEntitlements(businessId?: string) {
  const [entitlements, setEntitlements] = useState<Entitlements | null>(null);
  const [error, setError] = useState("");
  const reload = useCallback(async () => {
    if (!businessId) return;
    const client = getSupabase();
    if (!client) return;
    const { data, error: failure } = await client.rpc("business_entitlements", {
      bid: businessId,
    });
    if (failure) {
      setError(
        "Subscription details could not be loaded. Please try again online.",
      );
      return;
    }
    setEntitlements(data);
    setError("");
    try {
      localStorage.setItem(
        `countiva-entitlements:${businessId}`,
        JSON.stringify({ data, checkedAt: Date.now() }),
      );
    } catch {}
  }, [businessId]);
  useEffect(() => {
    if (businessId && !navigator.onLine) {
      try {
        const cached = JSON.parse(
          localStorage.getItem(`countiva-entitlements:${businessId}`) || "null",
        );
        if (cached && Date.now() - cached.checkedAt < 86400000) {
          const valid =
            cached.data.status === "legacy" ||
            Date.parse(cached.data.expiresAt) > Date.now();
          setEntitlements({
            ...cached.data,
            hasAccess: cached.data.hasAccess && valid,
          });
        }
      } catch {}
    }
    void reload();
    const timer = setInterval(() => {
      if (navigator.onLine) void reload();
      else
        setEntitlements((current) => {
          if (!current) return current;
          try {
            const cached = JSON.parse(
              localStorage.getItem(`countiva-entitlements:${businessId}`) ||
                "null",
            );
            return {
              ...current,
              hasAccess:
                current.hasAccess &&
                !!cached &&
                Date.now() - cached.checkedAt < 86400000 &&
                (!current.expiresAt ||
                  Date.parse(current.expiresAt) > Date.now()),
            };
          } catch {
            return { ...current, hasAccess: false };
          }
        });
    }, 60000);
    window.addEventListener("focus", reload);
    window.addEventListener("online", reload);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", reload);
      window.removeEventListener("online", reload);
    };
  }, [reload]);
  return { entitlements, error, reload };
}
