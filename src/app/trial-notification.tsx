import { Gift } from "lucide-react";
import type { BusinessNotification } from "../lib/business-notifications";

export default function TrialNotification({
  item,
  reading,
  onRead,
  onView,
}: {
  item: BusinessNotification;
  reading: boolean;
  onRead: () => void;
  onView?: () => void;
}) {
  const ended = !!item.revokedAt || Date.parse(item.expiresAt) <= Date.now();
  return (
    <article
      className={`trial-notification ${item.readAt ? "is-read" : "is-unread"}`}
      aria-label="Free Growth trial notification"
    >
      <span className="trial-notification-icon">
        <Gift size={22} />
      </span>
      <div className="trial-notification-copy">
        <span className="eyebrow">
          {item.readAt ? "ACCOUNT UPDATE" : "NEW · ACCOUNT UPDATE"}
        </span>
        <h3>
          {ended ? "Your free Growth trial period has ended" : item.title}
        </h3>
        <p>
          Countiva granted {item.businessName} free access to Growth.{" "}
          {ended ? "This trial ended" : "This trial ends"} on{" "}
          {new Date(item.revokedAt || item.expiresAt).toLocaleString("en-NG", {
            timeZone: "Africa/Lagos",
            dateStyle: "medium",
            timeStyle: "short",
          })}{" "}
          (Lagos time). No payment was taken for this trial.
        </p>
        {!ended && (
          <p>
            Owner + 5 users, 4 receipt templates and up to 100 stock scans per
            month. Detailed reports are purchased separately.
          </p>
        )}
        <div className="trial-notification-actions">
          {onView && (
            <button type="button" className="button secondary" onClick={onView}>
              View subscription
            </button>
          )}
          {!item.readAt && (
            <button
              type="button"
              className="button primary"
              onClick={onRead}
              disabled={reading}
            >
              {reading ? "Saving…" : "Got it"}
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
