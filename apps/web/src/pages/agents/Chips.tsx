import { Badge } from "../../ui";

const TONE_MAP = {
  ok: "live",
  neutral: "neutral",
  warn: "warn",
  error: "error",
} as const;

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
    <Badge tone={TONE_MAP[tone]} pulse={pulse}>
      {label}
    </Badge>
  );
}

export function KindChip({ kind }: { kind: string }) {
  const tone =
    kind === "discord" || kind === "subagent" || kind === "dashboard" || kind === "cron" ? "claw" : "neutral";
  return <Badge tone={tone}>{kindLabel(kind)}</Badge>;
}

function kindLabel(kind: string): string {
  switch (kind) {
    case "discord":
      return "Discord";
    case "subagent":
      return "Sub-agent";
    case "dashboard":
      return "Dashboard";
    case "cron":
      return "Cron";
    default:
      return kind;
  }
}
