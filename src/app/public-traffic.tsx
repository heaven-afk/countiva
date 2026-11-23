"use client";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
const paths = new Set([
  "/",
  "/plans",
  "/inventory-management",
  "/sales-tracking",
  "/receipts",
  "/business-insights",
  "/signup",
  "/login",
]);
export default function PublicTraffic() {
  const path = usePathname(),
    last = useRef("");
  useEffect(() => {
    if (
      !path ||
      !paths.has(path) ||
      last.current === path ||
      navigator.doNotTrack === "1"
    )
      return;
    last.current = path;
    try {
      const previous = JSON.parse(
        sessionStorage.getItem("countiva-visit-session") || "null",
      );
      const session =
        previous && Date.now() - previous.lastSeen < 1800000
          ? previous.id
          : crypto.randomUUID();
      sessionStorage.setItem(
        "countiva-visit-session",
        JSON.stringify({ id: session, lastSeen: Date.now() }),
      );
      let referrer = "";
      try {
        const origin = new URL(document.referrer);
        if (origin.hostname !== location.hostname) referrer = origin.hostname;
      } catch {}
      void fetch("/api/traffic", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId: crypto.randomUUID(),
          sessionId: session,
          path,
          referrer,
        }),
        keepalive: true,
      }).catch(() => {});
    } catch {}
  }, [path]);
  return null;
}
