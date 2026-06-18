export function Badge({
  children,
  tone = "neutral",
  pulse = false,
  className = "",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "live" | "ok" | "warn" | "error" | "claw";
  pulse?: boolean;
  className?: string;
}) {
  return (
    <span className={`dc-badge dc-badge-${tone} ${pulse ? "dc-badge-pulse" : ""} ${className}`.trim()}>
      {pulse ? <span className="dc-badge-dot" aria-hidden /> : null}
      {children}
    </span>
  );
}
