"use client";
import { useEffect, useState } from "react";
import { offers as defaults } from "../lib/plans";
import type { CatalogPlan, TrialPolicy } from "../lib/admin-operations";
export default function usePlanCatalog() {
  const [catalog, setCatalog] = useState<CatalogPlan[] | null>(null),
    [trial, setTrial] = useState<TrialPolicy>({
      enabled: true,
      days: 30,
      revision: 0,
    }),
    [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    function load() {
      fetch("/api/plans", { cache: "no-store", signal: controller.signal })
        .then(async (r) => {
          const data = await r.json();
          if (!r.ok) throw Error();
          setCatalog(data.plans);
          setTrial(data.trial);
          setError("");
        })
        .catch(() => {
          if (!controller.signal.aborted)
            setError(
              "Current plan details could not be loaded. Refresh before checking out.",
            );
        });
    }
    load();
    const refresh = () => {
      if (document.visibilityState === "visible") load();
    };
    const timer = setInterval(refresh, 30000);
    window.addEventListener("focus", refresh);
    return () => {
      controller.abort();
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, []);
  const offers = defaults.map((o) => {
    const current = catalog?.find((p) => p.code === o.code);
    const promotion =
      current?.promotionEndsAt &&
      new Date(current.promotionEndsAt).getTime() > Date.now();
    return {
      ...o,
      amount: current
        ? (!promotion && current.baseAmount
            ? current.baseAmount
            : current.amount) / 100
        : o.amount,
      baseAmount: current?.baseAmount ? current.baseAmount / 100 : o.amount,
      promotionEndsAt: promotion ? current.promotionEndsAt : null,
      promotionLabel: promotion ? current.promotionLabel : null,
      enabled: current?.enabled ?? !catalog,
    };
  });
  return { offers, trial, live: catalog !== null, catalogError: error };
}
