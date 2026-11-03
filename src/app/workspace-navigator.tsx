"use client";
import {
  BarChart3,
  LayoutDashboard,
  Menu,
  Package,
  ShoppingCart,
  TrendingUp,
  Users,
} from "lucide-react";

const primary = [
  { page: "Overview", label: "Home", Icon: LayoutDashboard },
  { page: "Inventory", label: "Stock", Icon: Package },
  { page: "Record sale", label: "Sell", Icon: ShoppingCart },
  { page: "Sales history", label: "Sales", Icon: BarChart3 },
  { page: "Customers & credit", label: "Credit", Icon: Users },
  { page: "Business insights", label: "Insights", Icon: TrendingUp },
];

export default function WorkspaceNavigator({
  page,
  menuOpen,
  onNavigate,
  onMore,
}: {
  page: string;
  menuOpen: boolean;
  onNavigate: (page: string) => void;
  onMore: () => void;
}) {
  return (
    <>
      {["desktop", "mobile"].map((variant) => {
        const items =
          variant === "mobile"
            ? primary.filter(
                (item) =>
                  !["Sales history", "Business insights"].includes(item.page),
              )
            : primary;
        const moreActive =
          menuOpen || !items.some((item) => item.page === page);
        return (
          <nav
            className={`workspace-navigator ${variant}-navigator`}
            key={variant}
            aria-label={`${variant === "mobile" ? "Mobile" : "Desktop"} workspace navigation`}
          >
            {items.map(({ page: destination, label, Icon }) => (
              <button
                className={`navigator-item ${!menuOpen && page === destination ? "selected" : ""}`}
                key={destination}
                aria-label={destination}
                title={destination}
                aria-current={
                  !menuOpen && page === destination ? "page" : undefined
                }
                onClick={() => onNavigate(destination)}
              >
                <Icon size={20} strokeWidth={1.7} />
                <span className="dock-label">{label}</span>
              </button>
            ))}
            <button
              className={`navigator-item ${moreActive ? "selected" : ""}`}
              aria-label="More pages"
              title="More pages"
              aria-expanded={menuOpen}
              aria-controls="workspace-menu"
              onClick={onMore}
            >
              <Menu size={20} strokeWidth={1.7} />
              <span className="dock-label">More</span>
            </button>
          </nav>
        );
      })}
    </>
  );
}
