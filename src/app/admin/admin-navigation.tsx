"use client";
import { useState } from "react";
import {
  Activity,
  Banknote,
  Bell,
  Building2,
  ChartNoAxesCombined,
  CreditCard,
  FileSliders,
  HeartPulse,
  Menu,
  ScanEye,
  ShieldCheck,
  X,
} from "lucide-react";
export const adminSections = [
  { id: "overview", label: "Overview", Icon: Activity },
  { id: "payments", label: "Transfers", Icon: Banknote },
  { id: "alerts", label: "Alerts", Icon: Bell },
  { id: "subscriptions", label: "Subscriptions", Icon: CreditCard },
  { id: "businesses", label: "Businesses", Icon: Building2 },
  { id: "support", label: "Business inspection", Icon: ScanEye },
  { id: "plans", label: "Plans & trials", Icon: FileSliders },
  { id: "traffic", label: "Website traffic", Icon: ChartNoAxesCombined },
  { id: "services", label: "Service health", Icon: HeartPulse },
  { id: "access", label: "Platform access", Icon: ShieldCheck },
] as const;
export type AdminSection = (typeof adminSections)[number]["id"];
export default function AdminNavigation({
  section,
  onChange,
  unread,
  reviewer,
}: {
  section: AdminSection;
  onChange: (section: AdminSection) => void;
  unread: number;
  reviewer: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const items = adminSections.filter(
    (item) => reviewer || !["payments", "alerts"].includes(item.id),
  );
  const choose = (value: AdminSection) => {
    onChange(value);
    setExpanded(false);
  };
  return (
    <>
      <aside
        className={`admin-sidebar ${expanded ? "is-open" : ""}`}
        aria-label="Admin navigation"
      >
        <div className="admin-sidebar-title">
          <span className="eyebrow">WORKSPACE</span>
          <button
            className="icon-button admin-menu-close"
            aria-label="Close navigation"
            onClick={() => setExpanded(false)}
          >
            <X size={20} />
          </button>
        </div>
        <nav>
          {items.map(({ id, label, Icon }) => (
            <a
              key={id}
              href={`#${id}`}
              aria-current={section === id ? "page" : undefined}
              onClick={(e) => {
                e.preventDefault();
                choose(id);
              }}
            >
              <Icon size={19} />
              <span>{label}</span>
              {id === "alerts" && unread > 0 && (
                <span className="admin-unread">{Math.min(unread, 99)}</span>
              )}
            </a>
          ))}
        </nav>
        <div className="admin-sidebar-footer">
          <ShieldCheck size={18} />
          <p>
            Private operations
            <br />
            <small>Access is checked for every action.</small>
          </p>
        </div>
        <a href="/workspace" className="text-button">
          Open business app ↗
        </a>
      </aside>
      <nav className="admin-mobile-nav" aria-label="Quick admin navigation">
        {items
          .filter((item) =>
            ["overview", "payments", "alerts", "businesses"].includes(item.id),
          )
          .map(({ id, label, Icon }) => (
            <button
              key={id}
              aria-current={section === id ? "page" : undefined}
              onClick={() => choose(id)}
            >
              <Icon size={21} />
              <span>{label}</span>
              {id === "alerts" && unread > 0 && (
                <i className="admin-notification-dot" />
              )}
            </button>
          ))}
        <button aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
          <Menu size={21} />
          <span>More</span>
        </button>
      </nav>
      {expanded && (
        <button
          className="admin-nav-backdrop"
          aria-label="Close navigation"
          onClick={() => setExpanded(false)}
        />
      )}
    </>
  );
}
