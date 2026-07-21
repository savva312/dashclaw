import { randomBytes } from "node:crypto";
import { isIP } from "node:net";

export const MIN_DASHBOARD_TOKEN_LENGTH = 32;

export interface DashboardAuthConfig {
  token: string;
  source: "environment" | "generated";
}

export function resolveDashboardAuth(
  configuredToken: string | undefined,
  bind: string,
): DashboardAuthConfig {
  if (configuredToken !== undefined) {
    if (configuredToken.replace(/\s/g, "").length < MIN_DASHBOARD_TOKEN_LENGTH) {
      throw new Error(
        `DASHCLAW_TOKEN must contain at least ${MIN_DASHBOARD_TOKEN_LENGTH} non-whitespace characters`,
      );
    }
    return { token: configuredToken, source: "environment" };
  }

  if (!isLoopbackBind(bind)) {
    throw new Error("DASHCLAW_TOKEN must be configured when DASHCLAW_BIND is not loopback");
  }

  return {
    token: randomBytes(32).toString("base64url"),
    source: "generated",
  };
}

export function isLoopbackBind(value: string): boolean {
  const unbracketed = value.startsWith("[") && value.endsWith("]") ? value.slice(1, -1) : value;
  if (unbracketed.toLowerCase() === "localhost") return true;

  const ipVersion = isIP(unbracketed);
  if (ipVersion === 6) return unbracketed === "::1";
  if (ipVersion === 4) return Number(unbracketed.split(".")[0]) === 127;
  return false;
}
