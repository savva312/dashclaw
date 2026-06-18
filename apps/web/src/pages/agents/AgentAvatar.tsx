import type { AgentSummary } from "@dashclaw/runtime-model";
import { agentAccentHue, agentInitials } from "./utils";

export function AgentAvatar({ agent, size = "md" }: { agent: AgentSummary; size?: "sm" | "md" | "lg" }) {
  const hue = agentAccentHue(agent.id);
  return (
    <div
      className={`agent-avatar agent-avatar-${size}`}
      style={{
        background: `linear-gradient(135deg, hsl(${hue} 62% 42%), hsl(${(hue + 36) % 360} 58% 32%))`,
      }}
      aria-hidden
    >
      {agentInitials(agent)}
    </div>
  );
}
