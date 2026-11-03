"use client";

import { useEffect, useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";

export default function ThemeControl() {
  const [theme, setTheme] = useState("system");
  useEffect(() => {
    try {
      const saved = localStorage.getItem("countiva-theme");
      setTheme(saved === "light" || saved === "dark" ? saved : "system");
    } catch {}
    const changed = (event: StorageEvent) => {
      if (event.key !== "countiva-theme") return;
      const next = ["light", "dark"].includes(event.newValue || "")
        ? event.newValue!
        : "system";
      setTheme(next);
      document.documentElement.dataset.theme = next;
    };
    window.addEventListener("storage", changed);
    return () => window.removeEventListener("storage", changed);
  }, []);
  return (
    <label className="theme-control">
      {theme === "dark" ? (
        <Moon size={16} />
      ) : theme === "light" ? (
        <Sun size={16} />
      ) : (
        <Monitor size={16} />
      )}
      <span>Appearance</span>
      <select
        aria-label="Appearance"
        value={theme}
        onChange={(event) => {
          const next = event.target.value;
          setTheme(next);
          document.documentElement.dataset.theme = next;
          try {
            localStorage.setItem("countiva-theme", next);
          } catch {}
        }}
      >
        <option value="system">System</option>
        <option value="light">Light</option>
        <option value="dark">Dark</option>
      </select>
    </label>
  );
}
