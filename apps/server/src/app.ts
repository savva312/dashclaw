import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { cors } from "hono/cors";
import type { RuntimeSnapshot, TimelineEvent } from "@dashclaw/runtime-model";
import type { AdminService } from "./admin-service.js";
import type { GatewayBridge } from "./gateway-bridge.js";
import type { RuntimeStore } from "./runtime-store.js";

export interface AppContext {
  store: RuntimeStore;
  bridge: GatewayBridge;
  admin: AdminService;
}

type SseClient = {
  push: (event: string, data: unknown) => void;
};

export function createApp(ctx: AppContext): Hono {
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
      origin: ["http://127.0.0.1:5173", "http://localhost:5173"],
      allowHeaders: ["Authorization", "Content-Type"],
    }),
  );

  const requireAuth = async (
    c: {
      req: { header: (n: string) => string | undefined; query: (n: string) => string | undefined };
      json: (b: unknown, s?: number) => Response;
    },
    next: () => Promise<void>,
  ) => {
    const headerAuth = c.req.header("Authorization");
    const queryToken = c.req.query("token");
    const authHeader = headerAuth ?? (queryToken ? `Bearer ${queryToken}` : undefined);
    if (!ctx.admin.validateAuth(authHeader)) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    await next();
  };

  app.get("/api/health", (c) =>
    c.json({
      ok: true,
      service: "dashclaw",
      gateway: ctx.bridge.getConnectionState(),
    }),
  );

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

  app.get("/api/events", requireAuth, (c) =>
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

  return app;
}
