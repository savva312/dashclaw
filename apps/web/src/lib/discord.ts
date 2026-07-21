const DISCORD_PERMALINK_ORIGIN = "https://discord.com";
const DISCORD_PERMALINK_PATH = /^\/channels\/(?:@me|\d{17,20})\/\d{17,20}(?:\/\d{17,20})?\/?$/;

export function safeDiscordPermalink(value: string | undefined): string | undefined {
  if (!value) return undefined;

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return undefined;
  }

  if (
    url.origin !== DISCORD_PERMALINK_ORIGIN
    || url.username
    || url.password
    || url.search
    || url.hash
  ) {
    return undefined;
  }

  if (!DISCORD_PERMALINK_PATH.test(url.pathname)) {
    return undefined;
  }

  return url.href;
}
