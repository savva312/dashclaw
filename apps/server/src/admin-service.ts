import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import {
  HIGH_RISK_RPC_METHODS,
  READ_RPC_METHODS,
  WRITE_RPC_METHODS,
  canonicalizeRpcParams,
  isHighRiskRpc,
  isWriteRpc,
  safeOutputValue,
  summarizeParams,
  toPublicError,
  type AdminRpcRequest,
  type PublicError,
  type SafeOutputValue,
} from "@dashclaw/runtime-model";
import type { GatewayBridge } from "./gateway-bridge.js";
import type { RuntimeStore } from "./runtime-store.js";

export interface AdminServiceOptions {
  store: RuntimeStore;
  bridge: GatewayBridge;
  dashboardToken: string;
  readOnly?: boolean;
  confirmationTtlMs?: number;
  maxConfirmationRecords?: number;
  sessionTtlMs?: number;
  maxSessionRecords?: number;
  now?: () => number;
  onAudit?: () => void;
}

export interface AuthenticatedPrincipal {
  id: string;
  kind: "dashboard-session";
}

export interface AuthenticationResult {
  principal: AuthenticatedPrincipal;
  sessionToken?: string;
  expiresAt: Date;
}

interface ConfirmationRecord {
  tokenDigest: Buffer;
  principalId: string;
  method: string;
  paramsDigest: Buffer;
  expiresAt: number;
}

interface SessionRecord {
  tokenDigest: Buffer;
  principal: AuthenticatedPrincipal;
  expiresAt: number;
}

const DEFAULT_CONFIRMATION_TTL_MS = 5 * 60_000;
const DEFAULT_MAX_CONFIRMATION_RECORDS = 1_000;
const DEFAULT_SESSION_TTL_MS = 24 * 60 * 60_000;
const DEFAULT_MAX_SESSION_RECORDS = 1_000;

export class AdminService {
  private confirmationRecords: ConfirmationRecord[] = [];
  private sessionRecords: SessionRecord[] = [];
  private onAudit?: () => void;
  private readonly dashboardTokenDigest: Buffer;

  constructor(private readonly options: AdminServiceOptions) {
    if (options.dashboardToken.trim().length === 0) {
      throw new Error("dashboardToken must not be empty");
    }
    this.onAudit = options.onAudit;
    this.dashboardTokenDigest = hashSecret(options.dashboardToken);
  }

  setOnAudit(handler: () => void): void {
    this.onAudit = handler;
  }

  validateAuth(header: string | undefined): boolean {
    if (!header?.startsWith("Bearer ")) return false;
    const token = header.slice("Bearer ".length);
    return timingSafeEqual(hashSecret(token), this.dashboardTokenDigest);
  }

  authenticate(header: string | undefined, sessionToken?: string): AuthenticationResult | null {
    if (!this.validateAuth(header)) return null;

    const now = this.now();
    this.pruneSessions(now);
    if (sessionToken) {
      const sessionDigest = hashSecret(sessionToken);
      const existing = this.sessionRecords.find((record) =>
        timingSafeEqual(record.tokenDigest, sessionDigest),
      );
      if (existing) {
        existing.expiresAt = now + this.sessionTtlMs;
        return {
          principal: existing.principal,
          expiresAt: new Date(existing.expiresAt),
        };
      }
    }

    const issuedToken = randomBytes(32).toString("base64url");
    const expiresAt = now + this.sessionTtlMs;
    const principal: AuthenticatedPrincipal = {
      id: `dashboard-session:${randomUUID()}`,
      kind: "dashboard-session",
    };
    this.sessionRecords.push({
      tokenDigest: hashSecret(issuedToken),
      principal,
      expiresAt,
    });
    this.boundSessions();
    return {
      principal,
      sessionToken: issuedToken,
      expiresAt: new Date(expiresAt),
    };
  }

  listAllowedMethods(): { read: string[]; write: string[]; highRisk: string[] } {
    return {
      read: [...READ_RPC_METHODS].sort(),
      write: this.options.readOnly ? [] : [...WRITE_RPC_METHODS].sort(),
      highRisk: this.options.readOnly ? [] : [...HIGH_RISK_RPC_METHODS].sort(),
    };
  }

  requestConfirmation(
    principal: AuthenticatedPrincipal,
    method: string,
    params?: Record<string, unknown>,
  ): { confirmToken: string; expiresAt: string } {
    if (this.options.readOnly) {
      throw new Error("Admin writes are disabled in read-only mode");
    }
    if (!isHighRiskRpc(method)) {
      throw new Error("Confirmation only required for high-risk RPC methods");
    }
    if (!WRITE_RPC_METHODS.has(method)) {
      throw new Error("Method not allowlisted for admin writes");
    }

    const now = this.now();
    this.pruneConfirmations(now);
    const confirmToken = randomBytes(32).toString("base64url");
    const expiresAt = now + this.confirmationTtlMs;
    this.confirmationRecords.push({
      tokenDigest: hashSecret(confirmToken),
      principalId: principal.id,
      method,
      paramsDigest: digestParams(params),
      expiresAt,
    });
    this.boundConfirmations();
    return { confirmToken, expiresAt: new Date(expiresAt).toISOString() };
  }

  async executeRpc(
    principal: AuthenticatedPrincipal,
    request: AdminRpcRequest,
  ): Promise<{ ok: true; result: SafeOutputValue } | ({ ok: false } & PublicError)> {
    const { method, params, confirmToken } = request;

    if (!READ_RPC_METHODS.has(method) && !WRITE_RPC_METHODS.has(method)) {
      return { ok: false, ...toPublicError(`Method not allowlisted: ${method}`, "RPC_METHOD_NOT_ALLOWED") };
    }
    if (this.options.readOnly && isWriteRpc(method)) {
      return {
        ok: false,
        ...toPublicError("Admin writes are disabled in read-only mode", "RPC_WRITES_DISABLED"),
      };
    }

    if (isWriteRpc(method) && isHighRiskRpc(method)) {
      if (!confirmToken) {
        return {
          ok: false,
          ...toPublicError(
            "High-risk RPC requires confirmToken from /api/admin/confirm",
            "RPC_CONFIRMATION_REQUIRED",
          ),
        };
      }
      if (!this.consumeConfirmation(confirmToken, principal, method, params)) {
        return {
          ok: false,
          ...toPublicError("Invalid or expired confirmToken", "RPC_CONFIRMATION_INVALID"),
        };
      }
    }

    const paramsSummary = summarizeParams(params);

    try {
      const result = await this.options.bridge.rpc(method, params);
      const safeResult = safeOutputValue(result);
      const resultSummary = summarizeParams(safeResult).slice(0, 500);

      this.options.store.appendAudit({
        timestamp: new Date().toISOString(),
        actor: principal.id,
        method,
        paramsSummary,
        success: true,
        resultSummary,
      });

      if (isWriteRpc(method)) {
        this.options.store.appendTimeline({
          kind: "admin.action",
          timestamp: new Date().toISOString(),
          title: `Admin RPC: ${method}`,
          summary: paramsSummary.slice(0, 200),
          severity: isHighRiskRpc(method) ? "warn" : "info",
          payload: { method },
        });
      }

      this.onAudit?.();
      await this.options.bridge.refreshSnapshot();
      return { ok: true, result: safeResult };
    } catch (err) {
      const publicError = toPublicError(err, "GATEWAY_RPC_FAILED");
      this.options.store.appendAudit({
        timestamp: new Date().toISOString(),
        actor: principal.id,
        method,
        paramsSummary,
        success: false,
        error: publicError.error,
      });
      this.onAudit?.();
      return { ok: false, ...publicError };
    }
  }

  private consumeConfirmation(
    confirmToken: string,
    principal: AuthenticatedPrincipal,
    method: string,
    params?: Record<string, unknown>,
  ): boolean {
    const now = this.now();
    this.pruneConfirmations(now);
    const tokenDigest = hashSecret(confirmToken);
    const recordIndex = this.confirmationRecords.findIndex((record) =>
      timingSafeEqual(record.tokenDigest, tokenDigest),
    );
    if (recordIndex < 0) return false;

    const [record] = this.confirmationRecords.splice(recordIndex, 1);
    if (!record || record.expiresAt <= now) return false;

    let paramsDigest: Buffer;
    try {
      paramsDigest = digestParams(params);
    } catch {
      return false;
    }

    return (
      record.principalId === principal.id &&
      record.method === method &&
      timingSafeEqual(record.paramsDigest, paramsDigest)
    );
  }

  private pruneConfirmations(now: number): void {
    this.confirmationRecords = this.confirmationRecords.filter((record) => record.expiresAt > now);
  }

  private boundConfirmations(): void {
    if (this.confirmationRecords.length > this.maxConfirmationRecords) {
      this.confirmationRecords.splice(0, this.confirmationRecords.length - this.maxConfirmationRecords);
    }
  }

  private pruneSessions(now: number): void {
    this.sessionRecords = this.sessionRecords.filter((record) => record.expiresAt > now);
  }

  private boundSessions(): void {
    if (this.sessionRecords.length > this.maxSessionRecords) {
      this.sessionRecords.splice(0, this.sessionRecords.length - this.maxSessionRecords);
    }
  }

  private now(): number {
    return (this.options.now ?? Date.now)();
  }

  private get confirmationTtlMs(): number {
    return this.options.confirmationTtlMs ?? DEFAULT_CONFIRMATION_TTL_MS;
  }

  private get maxConfirmationRecords(): number {
    return this.options.maxConfirmationRecords ?? DEFAULT_MAX_CONFIRMATION_RECORDS;
  }

  private get sessionTtlMs(): number {
    return this.options.sessionTtlMs ?? DEFAULT_SESSION_TTL_MS;
  }

  private get maxSessionRecords(): number {
    return this.options.maxSessionRecords ?? DEFAULT_MAX_SESSION_RECORDS;
  }
}

function hashSecret(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

function digestParams(params: unknown): Buffer {
  return createHash("sha256").update(canonicalizeRpcParams(params), "utf8").digest();
}
