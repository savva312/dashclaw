import { randomUUID, timingSafeEqual } from "node:crypto";
import {
  HIGH_RISK_RPC_METHODS,
  READ_RPC_METHODS,
  WRITE_RPC_METHODS,
  isHighRiskRpc,
  isWriteRpc,
  summarizeParams,
  type AdminRpcRequest,
} from "@dashclaw/runtime-model";
import type { GatewayBridge } from "./gateway-bridge.js";
import type { RuntimeStore } from "./runtime-store.js";

export interface AdminServiceOptions {
  store: RuntimeStore;
  bridge: GatewayBridge;
  dashboardToken: string;
  onAudit?: () => void;
}

export class AdminService {
  private confirmTokens = new Map<string, { method: string; expiresAt: number }>();
  private onAudit?: () => void;

  constructor(private readonly options: AdminServiceOptions) {
    this.onAudit = options.onAudit;
  }

  setOnAudit(handler: () => void): void {
    this.onAudit = handler;
  }

  validateAuth(header: string | undefined): boolean {
    if (!header?.startsWith("Bearer ")) return false;
    const token = header.slice("Bearer ".length);
    if (token.length !== this.options.dashboardToken.length) return false;
    try {
      return timingSafeEqual(Buffer.from(token), Buffer.from(this.options.dashboardToken));
    } catch {
      return false;
    }
  }

  listAllowedMethods(): { read: string[]; write: string[]; highRisk: string[] } {
    return {
      read: [...READ_RPC_METHODS].sort(),
      write: [...WRITE_RPC_METHODS].sort(),
      highRisk: [...HIGH_RISK_RPC_METHODS].sort(),
    };
  }

  requestConfirmation(method: string): { confirmToken: string; expiresAt: string } {
    if (!isHighRiskRpc(method)) {
      throw new Error("Confirmation only required for high-risk RPC methods");
    }
    const confirmToken = randomUUID();
    const expiresAt = Date.now() + 5 * 60_000;
    this.confirmTokens.set(confirmToken, { method, expiresAt });
    return { confirmToken, expiresAt: new Date(expiresAt).toISOString() };
  }

  async executeRpc(request: AdminRpcRequest): Promise<{ ok: true; result: unknown } | { ok: false; error: string }> {
    const { method, params, actor = "operator", confirmToken } = request;

    if (!READ_RPC_METHODS.has(method) && !WRITE_RPC_METHODS.has(method)) {
      return { ok: false, error: `Method not allowlisted: ${method}` };
    }

    if (isWriteRpc(method) && isHighRiskRpc(method)) {
      if (!confirmToken) {
        return { ok: false, error: "High-risk RPC requires confirmToken from /api/admin/confirm" };
      }
      const pending = this.confirmTokens.get(confirmToken);
      if (!pending || pending.method !== method || pending.expiresAt < Date.now()) {
        return { ok: false, error: "Invalid or expired confirmToken" };
      }
      this.confirmTokens.delete(confirmToken);
    }

    const paramsSummary = summarizeParams(params);

    try {
      const result = await this.options.bridge.rpc(method, params);
      const resultSummary = summarizeParams(result).slice(0, 500);

      this.options.store.appendAudit({
        timestamp: new Date().toISOString(),
        actor,
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
      return { ok: true, result };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.options.store.appendAudit({
        timestamp: new Date().toISOString(),
        actor,
        method,
        paramsSummary,
        success: false,
        error: message,
      });
      this.onAudit?.();
      return { ok: false, error: message };
    }
  }
}
