import { describe, expect, it } from "vitest";
import {
  channelNameFromDiscordLabel,
  discordDetail,
  humanSessionTitle,
  humanizeDiscordLabel,
  threadNameFromDiscordLabel,
} from "./format";

describe("humanizeDiscordLabel", () => {
  it("uses the channel name from discord:id#name labels", () => {
    expect(humanizeDiscordLabel("discord:1502628716830916770#evolve-monorepo")).toEqual({
      title: "#evolve-monorepo",
      detail: "discord:1502628716830916770",
    });
  });

  it("uses the thread title from Discord thread labels", () => {
    const result = humanizeDiscordLabel(
      "Discord thread #evolve-monorepo › 🤖 fix CI run 28963132515",
      "agent:evolve-monorepo:discord:channel:1524470502679122080",
    );
    expect(result.title).toBe("🤖 fix CI run 28963132515");
    expect(result.detail).toContain("#evolve-monorepo");
    expect(result.detail).toContain("channel:");
  });

  it("falls back when only an opaque discord id is available", () => {
    expect(humanizeDiscordLabel("discord:g-1505558029129744436")).toEqual({
      title: "Discord channel",
      detail: "discord:g-1505558029129744436",
    });
  });

  it("keeps non-discord labels intact", () => {
    expect(humanSessionTitle("Cron: nightly-repo-improvement-monitor")).toBe(
      "Cron: nightly-repo-improvement-monitor",
    );
  });
});

describe("discord label extractors", () => {
  it("extracts channel and thread names", () => {
    expect(channelNameFromDiscordLabel("discord:1502#dashclaw")).toBe("dashclaw");
    expect(threadNameFromDiscordLabel("Discord thread #dashclaw › TASK-037")).toBe("TASK-037");
    expect(discordDetail("discord:1502#dashclaw")).toBe("discord:1502");
  });
});
