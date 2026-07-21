import { describe, expect, it } from "vitest";
import { safeDiscordPermalink } from "./discord";

describe("safeDiscordPermalink", () => {
  it("allows only canonical HTTPS Discord channel permalinks", () => {
    expect(
      safeDiscordPermalink("https://discord.com/channels/12345678901234567/23456789012345678"),
    ).toBe("https://discord.com/channels/12345678901234567/23456789012345678");
    expect(
      safeDiscordPermalink("https://discord.com/channels/@me/23456789012345678/34567890123456789"),
    ).toBe("https://discord.com/channels/@me/23456789012345678/34567890123456789");
  });

  it.each([
    "javascript:alert(1)",
    "http://discord.com/channels/12345678901234567/23456789012345678",
    "https://discord.com.evil.example/channels/12345678901234567/23456789012345678",
    "https://evil.example/?next=https://discord.com/channels/12345678901234567/23456789012345678",
    "https://attacker@discord.com/channels/12345678901234567/23456789012345678",
    "https://discord.com/invite/12345678901234567",
    "https://discord.com/channels/example/23456789012345678",
    "https://discord.com/channels//12345678901234567/23456789012345678",
    "https://discord.com/channels/12345678901234567/23456789012345678/34567890123456789/extra",
    "https://discord.com/channels/12345678901234567/23456789012345678?redirect=evil",
    "https://discord.com/channels/12345678901234567/23456789012345678#fragment",
    "discord://channels/12345678901234567/23456789012345678",
    "not a URL",
  ])("rejects hostile or unexpected URL %s", (value) => {
    expect(safeDiscordPermalink(value)).toBeUndefined();
  });
});
