export function Skeleton({ lines = 3, className = "" }: { lines?: number; className?: string }) {
  return (
    <div className={`dc-skeleton ${className}`.trim()}>
      {Array.from({ length: lines }, (_, i) => (
        <div key={i} className={`dc-skeleton-line ${i === 1 ? "short" : ""}`} />
      ))}
    </div>
  );
}
