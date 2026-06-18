export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="dc-empty">
      <div className="dc-empty-orbit" aria-hidden />
      <strong>{title}</strong>
      {hint ? <p>{hint}</p> : null}
    </div>
  );
}
