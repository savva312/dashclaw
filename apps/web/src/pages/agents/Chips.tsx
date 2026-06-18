import { kindLabel } from "./utils";

export function KindChip({ kind }: { kind: string }) {
  return <span className={`kind-chip kind-${kind}`}>{kindLabel(kind)}</span>;
}

export function StatusChip({
  label,
  tone = "neutral",
  pulse = false,
}: {
  label: string;
  tone?: "ok" | "error" | "neutral" | "warn";
  pulse?: boolean;
}) {
  return (
    <span className={`status-chip tone-${tone}`}>
      {pulse ? <span className="status-pulse" aria-hidden /> : null}
      {label}
    </span>
  );
}
