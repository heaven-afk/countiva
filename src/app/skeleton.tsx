import CountivaMark from "./countiva-mark";
export default function Skeleton({
  label = "Loading your workspace",
  compact = false,
}: {
  label?: string;
  compact?: boolean;
}) {
  return (
    <div
      className={`loading-skeleton ${compact ? "compact" : ""}`}
      role="status"
      aria-label={label}
    >
      <span className="sr-only">{label}</span>
      <div className="skeleton-brand">
        <CountivaMark size={30} />
        <span>Preparing your workspace</span>
      </div>
      <div className="skeleton-line" aria-hidden="true" />
      <div className="skeleton-cards" aria-hidden="true">
        {[0, 1, 2].map((n) => (
          <div className="skeleton-card" key={n}>
            <span />
            <span />
          </div>
        ))}
      </div>
      {!compact && (
        <div className="skeleton-table" aria-hidden="true">
          {[0, 1, 2, 3].map((n) => (
            <div className="skeleton-line" key={n} />
          ))}
        </div>
      )}
    </div>
  );
}
