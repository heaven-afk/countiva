"use client";
import { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";

type Theme = "system" | "light" | "dark";
const AppearanceContext = createContext<{
  theme: Theme;
  choose: (theme: Theme) => void;
}>({ theme: "system", choose: () => {} });
const validTheme = (value: string | null): Theme =>
  value === "light" || value === "dark" ? value : "system";
function apply(theme: Theme) {
  const dark =
    theme === "dark" ||
    (theme === "system" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = theme;
  document.documentElement.dataset.resolvedTheme = dark ? "dark" : "light";
  document
    .querySelectorAll<HTMLLinkElement>('link[rel="icon"]')
    .forEach((link) => {
      link.href = `/favicon-${dark ? "dark" : "light"}.svg?v=4`;
      link.type = "image/svg+xml";
      link.sizes.value = "any";
    });
  document
    .querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')
    .forEach((meta) => {
      meta.content = dark ? "#161616" : "#f1f0ec";
      meta.removeAttribute("media");
    });
}
export default function AppearanceProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [theme, setTheme] = useState<Theme>("system");
  useEffect(() => {
    // A production offline shell must not serve stale styles to next dev.
    if (
      process.env.NODE_ENV === "development" &&
      "serviceWorker" in navigator
    ) {
      navigator.serviceWorker
        .getRegistrations()
        .then(async (registrations) => {
          await Promise.all(
            registrations
              .filter((registration) => {
                const worker =
                  registration.active ||
                  registration.waiting ||
                  registration.installing;
                return (
                  worker && new URL(worker.scriptURL).pathname === "/sw.js"
                );
              })
              .map((registration) => registration.unregister()),
          );
          if ("caches" in window) {
            const keys = await caches.keys();
            await Promise.all(
              keys
                .filter((key) => key.startsWith("shopilot-shell-"))
                .map((key) => caches.delete(key)),
            );
          }
        })
        .catch(() => {});
    }
    let saved: Theme = "system";
    try {
      saved = validTheme(localStorage.getItem("countiva-theme"));
    } catch {}
    setTheme(saved);
    apply(saved);
    const system = window.matchMedia("(prefers-color-scheme: dark)");
    const changed = () =>
      apply(validTheme(document.documentElement.dataset.theme || null));
    const stored = (event: StorageEvent) => {
      if (event.key !== "countiva-theme" && event.key !== null) return;
      const next = validTheme(event.newValue);
      setTheme(next);
      apply(next);
    };
    system.addEventListener("change", changed);
    window.addEventListener("storage", stored);
    return () => {
      system.removeEventListener("change", changed);
      window.removeEventListener("storage", stored);
    };
  }, []);
  function choose(next: Theme) {
    setTheme(next);
    apply(next);
    try {
      localStorage.setItem("countiva-theme", next);
    } catch {}
  }
  return (
    <AppearanceContext.Provider value={{ theme, choose }}>
      {children}
    </AppearanceContext.Provider>
  );
}
export const useAppearance = () => useContext(AppearanceContext);
