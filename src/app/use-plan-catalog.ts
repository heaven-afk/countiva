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
    fetch("/api/plans", { cache: "no-store", signal: controller.signal })
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw Error();
        setCatalog(data.plans);
        setTrial(data.trial);
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setError(
            "Current plan details could not be loaded. Refresh before checking out.",
          );
      });
    return () => controller.abort();
  }, []);
  const offers = defaults.map((o) => {
    const current = catalog?.find((p) => p.code === o.code);
    return {
      ...o,
      amount: current ? current.amount / 100 : o.amount,
      enabled: current?.enabled ?? !catalog,
    };
  });
  return { offers, trial, live: catalog !== null, catalogError: error };
}
