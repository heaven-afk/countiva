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
}: {
  businessName: string;
  role?: string;
  ownerName: string;
  online: boolean;
  syncing: boolean;
  menuOpen: boolean;
  onMenu: () => void;
  onNotifications?: () => void;
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
        <ThemeControl />
        {onNotifications && (
          <button
            className="icon-btn"
            aria-label="Open notifications"
            onClick={onNotifications}
          >
            <Bell size={19} />
          </button>
        )}
        <span
          className={"connection " + (!online ? "offline" : "")}
          title={online ? "Connected" : "Working offline"}
        >
          {online ? <Wifi size={14} /> : <WifiOff size={14} />}
          <span>{syncing ? "Saving…" : online ? "Online" : "Offline"}</span>
        </span>
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
