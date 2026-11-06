import { Bell, Menu, Wifi, WifiOff } from "lucide-react";
import Brand from "./brand";
import ThemeControl from "./theme-control";
export default function WorkspaceHeader({
  businessName,
  role,
  ownerName,
  online,
  syncing,
  menuOpen,
  onMenu,
  onNotifications,
  notificationsOpen = false,
}: {
  businessName: string;
  role?: string;
  ownerName: string;
  online: boolean;
  syncing: boolean;
  menuOpen: boolean;
  onMenu: () => void;
  onNotifications?: () => void;
  notificationsOpen?: boolean;
}) {
  return (
    <header className="workspace-header">
      <div className="workspace-header-identity">
        <Brand />
        <span className="header-divider" />
        <div className="workspace-header-name">
          <strong>{businessName}</strong>
          <small>
            {role === "owner"
              ? "Your business workspace"
              : role === "manager"
                ? "Manager workspace"
                : "Sales workspace"}
          </small>
        </div>
      </div>
      <div className="workspace-header-actions">
        <span
          className={"connection " + (!online ? "offline" : "")}
          title={online ? "Connected" : "Working offline"}
        >
          {online ? <Wifi size={14} /> : <WifiOff size={14} />}
          <span>{syncing ? "Saving…" : online ? "Online" : "Offline"}</span>
        </span>
        <ThemeControl />
        {onNotifications && (
          <button
            type="button"
            className={`workspace-notification-button ${notificationsOpen ? "is-active" : ""}`}
            aria-label="Open notifications"
            aria-current={notificationsOpen ? "page" : undefined}
            title="Notifications"
            onClick={onNotifications}
          >
            <Bell size={20} strokeWidth={1.7} />
          </button>
        )}
        <button
          className="profile-trigger"
          aria-label="Open business menu"
          aria-expanded={menuOpen}
          onClick={onMenu}
        >
          <span className="header-avatar">
            {ownerName.trim().slice(0, 2).toUpperCase()}
          </span>
          <Menu size={18} />
        </button>
      </div>
    </header>
  );
}
