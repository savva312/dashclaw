import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { cors } from "hono/cors";
import { serveStatic } from "@hono/node-server/serve-static";
import type { RuntimeSnapshot, TimelineEvent } from "@dashclaw/runtime-model";
import type { AdminService } from "./admin-service.js";
import type { GatewayBridge } from "./gateway-bridge.js";
import type { RuntimeStore } from "./runtime-store.js";

export interface AppContext {
  store: RuntimeStore;
  bridge: GatewayBridge;
  admin: AdminService;
}

export interface CreateAppOptions {
  webDist?: string;
}

type SseClient = {
  push: (event: string, data: unknown) => void;
};

export function createApp(ctx: AppContext, options: CreateAppOptions = {}): Hono {
  const app = new Hono();
  const sseClients = new Set<SseClient>();

  const broadcast = (event: string, data: unknown) => {
    for (const client of sseClients) client.push(event, data);
  };

  ctx.bridge.setEventHandlers({
    onSnapshot: (snapshot: RuntimeSnapshot) => broadcast("snapshot", snapshot),
    onTimeline: (event: TimelineEvent) => broadcast("timeline", event),
  });
  ctx.admin.setOnAudit(() => broadcast("audit", ctx.store.listAudit(20)));

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

  type AuthContext = {
    req: { header: (n: string) => string | undefined; query: (n: string) => string | undefined };
    json: (b: unknown, s?: number) => Response;
  };

  const requireAuth = async (c: AuthContext, next: () => Promise<void>) => {
    if (!ctx.admin.validateAuth(c.req.header("Authorization"))) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    await next();
  };

  const requireAuthForEvents = async (c: AuthContext, next: () => Promise<void>) => {
    const headerAuth = c.req.header("Authorization");
    const queryToken = c.req.query("token");
    // EventSource cannot send Authorization headers in browsers; ?token= is scoped to SSE only.
    const authHeader = headerAuth ?? (queryToken ? `Bearer ${queryToken}` : undefined);
    if (!ctx.admin.validateAuth(authHeader)) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    await next();
  };

  app.get("/api/health", (c) => c.json({ ok: true }));

  app.get("/api/snapshot", requireAuth, (c) => c.json(ctx.bridge.getSnapshot()));

  app.get("/api/timeline", requireAuth, (c) => {
    const limit = Number(c.req.query("limit") ?? "200");
    return c.json({ events: ctx.store.listTimeline(limit) });
  });

  app.get("/api/audit", requireAuth, (c) => c.json({ entries: ctx.store.listAudit(100) }));

  app.get("/api/admin/methods", requireAuth, (c) => c.json(ctx.admin.listAllowedMethods()));

  app.post("/api/admin/confirm", requireAuth, async (c) => {
    const body = await c.req.json<{ method: string }>();
    if (!body.method) return c.json({ error: "method required" }, 400);
    try {
      return c.json(ctx.admin.requestConfirmation(body.method));
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 400);
    }
  });

  app.post("/api/admin/rpc", requireAuth, async (c) => {
    const body = await c.req.json();
    const result = await ctx.admin.executeRpc(body);
    return c.json(result, result.ok ? 200 : 400);
  });

  app.post("/api/gateway/refresh", requireAuth, async (c) => {
    const snapshot = await ctx.bridge.refreshSnapshot();
    return c.json(snapshot);
  });

  app.get("/api/sessions/:key/preview", requireAuth, async (c) => {
    const key = decodeURIComponent(c.req.param("key"));
    try {
      const preview = await ctx.bridge.rpc("sessions.preview", { keys: [key], limit: 20 });
      return c.json(preview);
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 502);
    }
  });

  app.get("/api/cron/runs", requireAuth, async (c) => {
    const jobId = c.req.query("jobId");
    try {
      const runs = await ctx.bridge.rpc("cron.runs", jobId ? { jobId } : {});
      return c.json(runs);
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 502);
    }
  });

  app.get("/api/events", requireAuthForEvents, (c) =>
    streamSSE(c, async (stream) => {
      const client: SseClient = {
        push: (event, data) => {
          void stream.writeSSE({ event, data: JSON.stringify(data) });
        },
      };
      sseClients.add(client);

      client.push("snapshot", ctx.bridge.getSnapshot());
      for (const event of ctx.store.listTimeline(50)) {
        client.push("timeline", event);
      }

      const keepAlive = setInterval(() => {
        void stream.writeSSE({ event: "ping", data: "{}" });
      }, 15_000);

      stream.onAbort(() => {
        clearInterval(keepAlive);
        sseClients.delete(client);
      });

      await new Promise(() => {});
    }),
  );

  if (options.webDist) {
    attachWebUi(app, options.webDist);
  }

  return app;
}

function resolveWithinRoot(root: string, relativePath: string): string | null {
  const rootResolved = resolve(root);
  const candidate = resolve(rootResolved, relativePath);
  const rel = relative(rootResolved, candidate);
  if (rel.startsWith("..") || isAbsolute(rel)) return null;
  return candidate;
}

function attachWebUi(app: Hono, webDist: string): void {
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
  if (path.endsWith(".css")) return "text/css";
  if (path.endsWith(".js")) return "application/javascript";
  if (path.endsWith(".svg")) return "image/svg+xml";
  if (path.endsWith(".ico")) return "image/x-icon";
  if (path.endsWith(".png")) return "image/png";
  if (path.endsWith(".woff2")) return "font/woff2";
  return undefined;
}
