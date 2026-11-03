import {
  BarChart3,
  ChevronRight,
  CircleHelp,
  LayoutDashboard,
  LogOut,
  Package,
  Search,
  Settings,
  ShoppingBag,
  ShoppingCart,
  TrendingUp,
  Users,
  X,
} from "lucide-react";
import Brand from "./brand";
const navigation = [
  ["Overview", LayoutDashboard],
  ["Record sale", ShoppingCart],
  ["Inventory", Package],
  ["Sales history", BarChart3],
  ["Customers & credit", Users],
  ["Business insights", TrendingUp],
  ["Subscription", ShoppingBag],
] as const;
export default function WorkspaceMenu({
  businessName,
  query,
  onSearch,
  onClose,
  onNavigate,
  onSignOut,
  busy = false,
  syncing = false,
}: {
  businessName: string;
  query: string;
  onSearch: (value: string) => void;
  onClose: () => void;
  onNavigate: (page: string) => void;
  onSignOut: () => void;
  busy?: boolean;
  syncing?: boolean;
}) {
  const aliases: Record<string, string> = {
    Inventory: "stock products catalogue",
    Overview: "home dashboard",
    "Record sale": "sell checkout",
    Subscription: "plans pricing billing",
    "Customers & credit": "debt repayments balances",
  };
  const items = [
    ...navigation,
    ["Settings & data", Settings],
    ["Help & documentation", CircleHelp],
  ].filter(([label]) =>
    `${label} ${aliases[String(label)] || ""}`
      .toLowerCase()
      .includes(query.trim().toLowerCase()),
  );
  return (
    <div className="mobile-menu-overlay" onClick={() => onClose()}>
      <section
        className="mobile-menu-sheet"
        id="workspace-menu"
        role="dialog"
        aria-modal="true"
        aria-label="Business menu"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mobile-menu-brand">
          <Brand />
        </div>
        <div className="mobile-menu-heading">
          <div>
            <small>YOUR BUSINESS</small>
            <h2>{businessName}</h2>
          </div>
          <button
            className="mobile-close"
            aria-label="Close menu"
            onClick={() => onClose()}
          >
            <X size={21} />
          </button>
        </div>
        <div className="menu-search">
          <label htmlFor="menu-search">Find a page</label>
          <div className="search">
            <Search size={17} />
            <input
              id="menu-search"
              type="search"
              placeholder="Search your workspace"
              value={query}
              onChange={(event) => onSearch(event.target.value)}
            />
          </div>
        </div>
        <div className="mobile-menu-links">
          {items.map(([label, Icon]) => {
            const target =
              label === "Settings & data"
                ? "Settings"
                : label === "Help & documentation"
                  ? "Help"
                  : label;
            return (
              <button
                key={String(label)}
                onClick={() => onNavigate(String(target))}
              >
                <Icon size={20} />
                <span>{String(label)}</span>
                <ChevronRight size={17} />
              </button>
            );
          })}
        </div>
        {!items.length && (
          <p className="menu-empty" role="status">
            No pages match “{query}”. Try stock, sales or settings.
          </p>
        )}
        <button
          className="mobile-signout"
          disabled={busy || syncing}
          onClick={() => onSignOut()}
        >
          <LogOut size={19} /> Sign out
        </button>
      </section>
    </div>
  );
}
