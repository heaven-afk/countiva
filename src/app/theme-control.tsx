"use client";
import { Monitor, Moon, Sun } from "lucide-react";
import { useAppearance } from "./appearance-provider";

export default function ThemeControl({
  compact = false,
}: {
  compact?: boolean;
}) {
  const { theme, choose } = useAppearance();
  return (
    <label className={`theme-control ${compact ? "compact" : ""}`}>
      {theme === "dark" ? (
        <Moon size={17} />
      ) : theme === "light" ? (
        <Sun size={17} />
      ) : (
        <Monitor size={17} />
      )}
      <span className="sr-only">Appearance</span>
      <select
        aria-label="Appearance"
        value={theme}
        onChange={(event) =>
          choose(event.target.value as "system" | "light" | "dark")
        }
      >
        <option value="system">System theme</option>
        <option value="light">Light theme</option>
        <option value="dark">Dark theme</option>
      </select>
    </label>
  );
}
