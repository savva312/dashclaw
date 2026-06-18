export function LiveIndicator({ live, className = "" }: { live: boolean; className?: string }) {
  return (
    <span className={`dc-live-indicator ${live ? "is-on" : ""} ${className}`.trim()}>
      <span className="dc-live-indicator-core" aria-hidden />
      {live ? "live" : "polling"}
    </span>
  );
}
