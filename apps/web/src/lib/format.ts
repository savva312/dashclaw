export function formatCompactTitle(title: string, max = 72): string {
  const compact = title.trim();
  if (compact.length <= max) return compact;
  const [first, ...rest] = compact.split(/\s+/);
  if (/^[a-f0-9]{24,}$/i.test(first)) {
    const tail = rest.length > 0 ? ` ${rest.join(" ")}` : "";
    return `${first.slice(0, 8)}…${first.slice(-6)}${tail}`;
  }
  return `${compact.slice(0, max)}…`;
}

export interface DiscordDisplay {
  /** Human-friendly primary label (channel/thread title). */
  title: string;
  /** Muted Discord id / key hint for secondary display. */
  detail?: string;
}

const DISCORD_HASH_LABEL = /^discord:([^#\s]+)#(.+)$/i;
const DISCORD_ID_ONLY = /^discord:(g-)?(\d+)$/i;
const DISCORD_THREAD_LABEL = /^discord\s+thread\s+(#?[^\s›>]+)\s*[›>]\s*(.+)$/i;
const SNOWFLAKE = /^\d{16,22}$/;

/**
 * Turn raw OpenClaw Discord session labels into operator-friendly titles.
 * Examples:
 * - `discord:1502…#evolve-monorepo` → `#evolve-monorepo`
 * - `Discord thread #evolve-monorepo › fix CI` → `fix CI`
 * - `discord:g-1505…` → `Discord channel` (when no name is available)
 */
export function humanizeDiscordLabel(label?: string | null, key?: string | null): DiscordDisplay {
  const rawLabel = label?.trim() || "";
  const rawKey = key?.trim() || "";
  const keyHint = discordKeyHint(rawKey);

  if (!rawLabel && !rawKey) return { title: "Unknown session" };

  const threadMatch = rawLabel.match(DISCORD_THREAD_LABEL);
  if (threadMatch) {
    const channel = threadMatch[1].startsWith("#") ? threadMatch[1] : `#${threadMatch[1]}`;
    const threadTitle = threadMatch[2].trim();
    return {
      title: threadTitle || channel,
      detail: [channel, keyHint].filter(Boolean).join(" · ") || undefined,
    };
  }

  const hashMatch = rawLabel.match(DISCORD_HASH_LABEL);
  if (hashMatch) {
    const guildOrId = hashMatch[1];
    const name = hashMatch[2].trim();
    const channelTitle = name.includes("→")
      ? name
      : name.startsWith("#")
        ? name
        : `#${name}`;
    return {
      title: channelTitle,
      detail: [`discord:${guildOrId}`, keyHint].filter(Boolean).join(" · ") || undefined,
    };
  }

  const idOnly = rawLabel.match(DISCORD_ID_ONLY);
  if (idOnly) {
    return {
      title: "Discord channel",
      detail: [rawLabel, keyHint].filter(Boolean).join(" · ") || undefined,
    };
  }

  if (rawLabel && !looksLikeOpaqueDiscordId(rawLabel)) {
    const cleaned = rawLabel.replace(/^thread:\s*/i, "").trim() || rawLabel;
    return {
      title: cleaned,
      detail: keyHint && keyHint !== cleaned ? keyHint : undefined,
    };
  }

  if (keyHint) {
    const named = channelNameFromKey(rawKey);
    return {
      title: named ?? "Discord channel",
      detail: keyHint,
    };
  }

  return { title: rawLabel || rawKey };
}

export function humanSessionTitle(label?: string | null, key?: string | null, max = 72): string {
  return formatCompactTitle(humanizeDiscordLabel(label, key).title, max);
}

export function discordDetail(label?: string | null, key?: string | null): string | undefined {
  return humanizeDiscordLabel(label, key).detail;
}

/** Extract a channel/thread name from a `discord:id#name` style label when structured fields are missing. */
export function channelNameFromDiscordLabel(label?: string | null): string | undefined {
  if (!label) return undefined;
  const threadMatch = label.trim().match(DISCORD_THREAD_LABEL);
  if (threadMatch) {
    const channel = threadMatch[1].replace(/^#/, "");
    return channel || undefined;
  }
  const hashMatch = label.trim().match(DISCORD_HASH_LABEL);
  if (hashMatch) {
    const name = hashMatch[2].split("→")[0]?.trim().replace(/^#/, "");
    return name || undefined;
  }
  return undefined;
}

export function threadNameFromDiscordLabel(label?: string | null): string | undefined {
  if (!label) return undefined;
  const threadMatch = label.trim().match(DISCORD_THREAD_LABEL);
  if (threadMatch) return threadMatch[2].trim() || undefined;
  return undefined;
}

function discordKeyHint(key: string): string | undefined {
  if (!key) return undefined;
  const parts = key.split(":");
  if (parts.length >= 5 && parts[2] === "discord") {
    const kind = parts[3];
    const id = parts[parts.length - 1] ?? "";
    if (SNOWFLAKE.test(id) || /^g-\d+$/.test(id)) {
      return `${kind}:${id.length > 12 ? `${id.slice(0, 6)}…${id.slice(-4)}` : id}`;
    }
    return `discord:${kind}:${id}`;
  }
  if (key.startsWith("discord:")) return formatCompactTitle(key, 36);
  return undefined;
}

function channelNameFromKey(key: string): string | undefined {
  const parts = key.split(":");
  if (parts.length >= 5 && parts[2] === "discord" && parts[3] === "thread") {
    const id = parts[parts.length - 1];
    if (id && !SNOWFLAKE.test(id) && !/^g-\d+$/.test(id)) return id;
  }
  return undefined;
}

function looksLikeOpaqueDiscordId(value: string): boolean {
  return DISCORD_ID_ONLY.test(value) || SNOWFLAKE.test(value) || /^discord:/i.test(value);
}
