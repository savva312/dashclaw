export function StatStrip({
  items,
}: {
  items: Array<{ label: string; value: number | string; tone?: "live" | "default" }>;
}) {
  return (
    <div className="dc-stat-strip">
      {items.map((item) => (
        <div key={item.label} className={`dc-stat ${item.tone === "live" ? "dc-stat-live" : ""}`}>
          <span className="dc-stat-value">{item.value}</span>
          <span className="dc-stat-label">{item.label}</span>
        </div>
      ))}
    </div>
  );
}
