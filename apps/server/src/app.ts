import { existsSync, readFileSync } from "node:fs";
import { Buffer } from "node:buffer";
import { isAbsolute, relative, resolve } from "node:path";
import { Hono } from "hono";
import type { MiddlewareHandler } from "hono";
import { streamSSE } from "hono/streaming";
import { bodyLimit } from "hono/body-limit";
import { cors } from "hono/cors";
import { serveStatic } from "@hono/node-server/serve-static";
import {
  RUNTIME_LIMITS,
  safeAuditLogEntry,
  safeOutputValue,
  safeRuntimeSnapshot,
  safeSessionPreview,
  safeTimelineEvent,
  toPublicError,
  type AdminConfirmationRequest,
  type AdminRpcRequest,
  type RuntimeSnapshot,
  type TimelineEvent,
} from "@dashclaw/runtime-model";
import type { AdminService, AuthenticatedPrincipal } from "./admin-service.js";
import type { GatewayBridge } from "./gateway-bridge.js";
import type { RuntimeStore } from "./runtime-store.js";

export interface AppContext {
  store: RuntimeStore;
  bridge: GatewayBridge;
  admin: AdminService;
}

export interface CreateAppOptions {
  webDist?: string;
  readOnly?: boolean;
  maxSseClients?: number;
  sseMaxConnectionMs?: number;
}

type SseClient = {
  push: (event: string, data: unknown) => void;
};

type AppEnv = {
  Variables: {
    principal: AuthenticatedPrincipal;
  };
};

const SESSION_COOKIE = "dashclaw_session";

const PRODUCTION_CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "base-uri 'self'",
  "connect-src 'self'",
  "font-src 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "frame-src 'none'",
  "img-src 'self' data:",
  "object-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "style-src-attr 'unsafe-inline'",
].join("; ");

export function createApp(ctx: AppContext, options: CreateAppOptions = {}): Hono<AppEnv> {
  const app = new Hono<AppEnv>();
  const sseClients = new Set<SseClient>();
  const maxSseClients = boundedOption(options.maxSseClients, RUNTIME_LIMITS.sse.maxClients);
  const sseMaxConnectionMs = boundedOption(
    options.sseMaxConnectionMs,
    RUNTIME_LIMITS.sse.maxConnectionMs,
  );
  let activeSseConnections = 0;

  if (options.webDist) {
    app.use("*", async (c, next) => {
      await next();
      c.res.headers.set("Content-Security-Policy", PRODUCTION_CONTENT_SECURITY_POLICY);
      c.res.headers.set("Permissions-Policy", "camera=(), geolocation=(), microphone=()");
      c.res.headers.set("Referrer-Policy", "no-referrer");
      c.res.headers.set("X-Content-Type-Options", "nosniff");
    });
  }

  const broadcast = (event: string, data: unknown) => {
    const safeData = safeOutputValue(data);
    for (const client of sseClients) client.push(event, safeData);
  };

  ctx.bridge.setEventHandlers({
    onSnapshot: (snapshot: RuntimeSnapshot) => broadcast("snapshot", safeRuntimeSnapshot(snapshot)),
    onTimeline: (event: TimelineEvent) => broadcast("timeline", safeTimelineEvent(event)),
  });
  ctx.admin.setOnAudit(() => broadcast("audit", ctx.store.listAudit(20).map(safeAuditLogEntry)));

  app.use(
    "*",
    cors({
      origin: (origin) => {
        if (!origin) return origin;
        if (origin.startsWith("http://127.0.0.1:") || origin.startsWith("http://localhost:")) {
          return origin;
        }
        return null;
      },
      allowHeaders: ["Authorization", "Content-Type"],
    }),
  );
  app.use(
    "/api/*",
    bodyLimit({
      maxSize: RUNTIME_LIMITS.http.maxJsonBodyBytes,
      onError: (c) => c.json({ error: "Request body too large" }, 413),
    }),
  );

  const authenticateRequest = (
    c: Parameters<MiddlewareHandler<AppEnv>>[0],
    authHeader: string | undefined,
  ): boolean => {
    const auth = ctx.admin.authenticate(authHeader, readCookie(c.req.header("Cookie"), SESSION_COOKIE));
    if (!auth) return false;

    c.set("principal", auth.principal);
    if (auth.sessionToken) {
      c.header(
        "Set-Cookie",
        serializeSessionCookie(
          auth.sessionToken,
          Math.max(0, Math.floor((auth.expiresAt.getTime() - Date.now()) / 1_000)),
          new URL(c.req.url).protocol === "https:",
        ),
      );
    }
    return true;
  };

  const requireAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
    if (!authenticateRequest(c, c.req.header("Authorization"))) {
      return c.json(toPublicError("Unauthorized", "UNAUTHORIZED"), 401);
    }
    await next();
  };

  app.get("/api/health", (c) => c.json({ ok: true, storage: ctx.store.getStorageHealth() }));

  app.get("/api/snapshot", requireAuth, (c) => c.json(safeRuntimeSnapshot(ctx.bridge.getSnapshot())));

  app.get("/api/timeline", requireAuth, (c) => {
    const parsed = parseQueryLimit(
      c.req.query("limit"),
      RUNTIME_LIMITS.http.timelineDefault,
      RUNTIME_LIMITS.http.timelineMax,
    );
    if (!parsed.ok) return c.json(toPublicError(parsed.error, "INVALID_LIMIT"), 400);
    return c.json({
      events: ctx.store.listTimeline(parsed.value).map(safeTimelineEvent),
    });
  });

  app.get("/api/audit", requireAuth, (c) => {
    const parsed = parseQueryLimit(c.req.query("limit"), 100, RUNTIME_LIMITS.http.auditMax);
    if (!parsed.ok) return c.json(toPublicError(parsed.error, "INVALID_LIMIT"), 400);
    return c.json({
      entries: ctx.store.listAudit(parsed.value).map(safeAuditLogEntry),
    });
  });

  app.get("/api/admin/methods", requireAuth, (c) =>
    c.json(safeOutputValue(ctx.admin.listAllowedMethods()) as object),
  );

  if (!options.readOnly) {
    app.post("/api/admin/confirm", requireAuth, async (c) => {
      const body = await c.req.json<AdminConfirmationRequest>();
      if (!body.method) {
        return c.json(toPublicError("method required", "METHOD_REQUIRED"), 400);
      }
      try {
        return c.json(
          safeOutputValue(
            ctx.admin.requestConfirmation(c.get("principal"), body.method, body.params),
          ) as object,
        );
      } catch (err) {
        return c.json(toPublicError(err, "CONFIRMATION_REJECTED"), 400);
      }
    });

    app.post("/api/admin/rpc", requireAuth, async (c) => {
      const body = await c.req.json<AdminRpcRequest>();
      const result = await ctx.admin.executeRpc(c.get("principal"), body);
      return c.json(safeOutputValue(result) as object, result.ok ? 200 : 400);
    });
  }

  app.post("/api/gateway/refresh", requireAuth, async (c) => {
    const snapshot = await ctx.bridge.refreshSnapshot();
    return c.json(safeRuntimeSnapshot(snapshot));
  });

  app.get("/api/sessions/:key/preview", requireAuth, async (c) => {
    const key = c.req.param("key");
    try {
      const preview = await ctx.bridge.rpc("sessions.preview", { keys: [key], limit: 20 });
      return c.json(safeSessionPreview(preview));
    } catch (err) {
      return c.json(toPublicError(err, "GATEWAY_PREVIEW_FAILED"), 502);
    }
  });

  app.get("/api/cron/runs", requireAuth, async (c) => {
    const jobId = c.req.query("jobId");
    try {
      const runs = await ctx.bridge.rpc("cron.runs", {
        ...(jobId ? { jobId } : {}),
        limit: RUNTIME_LIMITS.browser.maxCronRuns,
      });
      return c.json(
        safeOutputValue(runs, {
          maxArrayItems: RUNTIME_LIMITS.browser.maxCronRuns,
          maxTotalNodes: RUNTIME_LIMITS.gateway.maxJsonNodes,
        }) as object,
      );
    } catch (err) {
      return c.json(toPublicError(err, "GATEWAY_CRON_RUNS_FAILED"), 502);
    }
  });

  app.get("/api/events", requireAuth, (c) => {
    if (activeSseConnections >= maxSseClients) {
      return c.json({ error: "SSE client limit reached" }, 503);
    }
    activeSseConnections += 1;
    let reservationReleased = false;
    const releaseReservation = () => {
      if (reservationReleased) return;
      reservationReleased = true;
      activeSseConnections -= 1;
    };

    try {
      return streamSSE(c, async (stream) => {
        let closed = false;
        let pendingWrites = 0;
        let writeChain = Promise.resolve();
        let finish: () => void = () => {};
        let keepAlive: ReturnType<typeof setInterval> | undefined;

        const cleanup = () => {
          if (closed) return;
          closed = true;
          releaseReservation();
          if (keepAlive) clearInterval(keepAlive);
          clearTimeout(maxAge);
          sseClients.delete(client);
          finish();
        };

        const client: SseClient = {
          push: (event, data) => {
            if (closed) return;
            const serialized = serializeSseData(data);
            if (serialized === null || pendingWrites >= RUNTIME_LIMITS.sse.maxPendingWritesPerClient) {
              cleanup();
              void stream.close();
              return;
            }
            pendingWrites += 1;
            writeChain = writeChain
              .then(() => stream.writeSSE({ event, data: serialized }))
              .catch(cleanup)
              .finally(() => {
                pendingWrites -= 1;
              });
          },
        };

        const done = new Promise<void>((resolveDone) => {
          finish = resolveDone;
        });
        const maxAge = setTimeout(() => {
          cleanup();
          void stream.close();
        }, sseMaxConnectionMs);
        stream.onAbort(cleanup);

        try {
          const snapshot = serializeSseData(safeRuntimeSnapshot(ctx.bridge.getSnapshot()));
          if (snapshot === null) {
            throw new Error("Initial SSE snapshot exceeds event limit");
          }
          await stream.writeSSE({ event: "snapshot", data: snapshot });
          for (const event of ctx.store.listTimeline(50)) {
            const serialized = serializeSseData(safeTimelineEvent(event));
            if (serialized !== null) {
              await stream.writeSSE({ event: "timeline", data: serialized });
            }
          }

          sseClients.add(client);
          keepAlive = setInterval(() => client.push("ping", {}), RUNTIME_LIMITS.sse.keepAliveMs);
          await done;
        } finally {
          cleanup();
        }
      });
    } catch (error) {
      releaseReservation();
      throw error;
    }
  });

  if (options.webDist) {
    attachWebUi(app, options.webDist);
  }

  return app;
}

export function parseQueryLimit(
  raw: string | undefined,
  fallback: number,
  maximum: number,
): { ok: true; value: number } | { ok: false; error: string } {
  if (raw === undefined) return { ok: true, value: fallback };
  if (!/^[1-9]\d*$/.test(raw)) {
    return { ok: false, error: "limit must be a positive integer" };
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value)) {
    return { ok: false, error: "limit must be a finite safe integer" };
  }
  return { ok: true, value: Math.min(value, maximum) };
}

function serializeSseData(data: unknown): string | null {
  try {
    const serialized = JSON.stringify(safeOutputValue(data));
    return Buffer.byteLength(serialized, "utf8") <= RUNTIME_LIMITS.sse.maxEventBytes
      ? serialized
      : null;
  } catch {
    return null;
  }
}

function boundedOption(value: number | undefined, maximum: number): number {
  if (!Number.isInteger(value) || (value ?? 0) < 1) return maximum;
  return Math.min(value!, maximum);
}

function resolveWithinRoot(root: string, relativePath: string): string | null {
  const rootResolved = resolve(root);
  const candidate = resolve(rootResolved, relativePath);
  const rel = relative(rootResolved, candidate);
  if (rel.startsWith("..") || isAbsolute(rel)) return null;
  return candidate;
}

function attachWebUi(app: Hono<AppEnv>, webDist: string): void {
  app.use("/assets/*", serveStatic({ root: webDist }));

  app.get("*", (c) => {
    if (c.req.path.startsWith("/api")) return c.notFound();

    const relativePath = c.req.path === "/" ? "index.html" : c.req.path.slice(1);
    const candidate = resolveWithinRoot(webDist, relativePath);
    if (!candidate) return c.notFound();

    if (relativePath.includes(".") && existsSync(candidate)) {
      const body = readFileSync(candidate);
      const type = contentType(relativePath);
      return c.body(body, 200, type ? { "Content-Type": type } : undefined);
    }

    const indexPath = resolveWithinRoot(webDist, "index.html");
    if (!indexPath) return c.notFound();
    const html = readFileSync(indexPath, "utf8");
    return c.html(html);
  });
}

function contentType(path: string): string | undefined {
  if (path.endsWith(".html")) return "text/html; charset=utf-8";
  if (path.endsWith(".css")) return "text/css";
  if (path.endsWith(".js")) return "application/javascript";
  if (path.endsWith(".svg")) return "image/svg+xml";
  if (path.endsWith(".ico")) return "image/x-icon";
  if (path.endsWith(".png")) return "image/png";
  if (path.endsWith(".woff2")) return "font/woff2";
  return undefined;
}

function readCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const [cookieName, ...valueParts] = part.trim().split("=");
    if (cookieName !== name) continue;
    const value = valueParts.join("=");
    try {
      return decodeURIComponent(value);
    } catch {
      return undefined;
    }
  }
  return undefined;
}

function serializeSessionCookie(token: string, maxAgeSeconds: number, secure: boolean): string {
  return [
    `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
    "Path=/",
    `Max-Age=${maxAgeSeconds}`,
    "HttpOnly",
    "SameSite=Strict",
    ...(secure ? ["Secure"] : []),
  ].join("; ");
}
