import { Hono } from "hono";
import { cors } from "hono/cors";
import { bodyLimit } from "hono/body-limit";
import { env } from "./config/env";
import { createGatewayRoutes } from "./gateway/gateway.routes";
import { createOpenApiRoutes } from "./openapi/openapi.routes";
import { collabModuleRoutes } from "./modules/collab/index";
import { onError } from "./shared/middlewares/error-handler.middleware";
import type { AppEnv } from "./shared/middlewares/auth.middleware";
import { authMiddleware } from "./shared/middlewares/auth.middleware";
import { securityHeadersMiddleware } from "./shared/middlewares/security.middleware";
import { checkPostgres, checkRedis } from "./shared/health";
import { buildHealthResponse } from "@sebascarvajal11/cima-contracts/health";
import {
  createServiceMetrics,
  metricsEndpointHandler,
  httpMetricsMiddleware,
  type ServiceMetrics,
} from "@sebascarvajal11/cima-contracts/metrics";
import { pool } from "./db/connection";
import { getRedisConnection } from "./shared/redis";
import { initLogger } from "./shared/logger";
import { requestLoggerMiddleware } from "./shared/middlewares/request-logger.middleware";
import { listAuthEventDlqEntries, replayAuthEventDlqEntry } from "./modules/collab/events/auth-events-dlq";
import { getServiceJwksDocument } from "./config/jwt";

const logger = initLogger("mod-collab");
const healthStartTime = Date.now();

/** Instancia de métricas compartida con los workers de este proceso. */
export const serviceMetrics: ServiceMetrics = createServiceMetrics("crm-collab");

export const createApp = () => {
  const app = new Hono<AppEnv>();

  // --- Middlewares Globales ---
  app.use("*", requestLoggerMiddleware());
  app.use("*", securityHeadersMiddleware);
  app.use("*", httpMetricsMiddleware(serviceMetrics));
  app.use(
    "*",
    bodyLimit({
      maxSize: 1 * 1024 * 1024, // 1MB payload limit (collab metadata/chat only, binary uploads go directly to OCI)
      onError: (c) => {
        return c.json({ error: "El tamaño del payload excede el límite de 1MB" }, 413);
      },
    })
  );

  if (env.MOD_COLLAB_CORS) {
    app.use(
      "*",
      cors({
        origin: env.CORS_ORIGIN,
        credentials: true,
      })
    );
  }

  // --- (a) Grupo de Rutas Públicas ---
  const publicRoutes = new Hono<AppEnv>();

  publicRoutes.get("/health", async (c) => {
    const [pg, redis] = await Promise.all([
      checkPostgres(pool),
      checkRedis(getRedisConnection()),
    ]);
    const { body, status } = buildHealthResponse(env.SERVICE_VERSION, healthStartTime, {
      db: pg,
      redis,
    });
    return c.json(body, status);
  });

  publicRoutes.get("/metrics", metricsEndpointHandler(serviceMetrics.registry));

  publicRoutes.get("/.well-known/service-jwks.json", (c) =>
    c.json(getServiceJwksDocument(), 200, {
      "Cache-Control": "public, max-age=3600",
    })
  );

  publicRoutes.route("/", createOpenApiRoutes());
  app.route("/", publicRoutes);

  // --- (b) Grupo de Rutas Internas ---
  const internalRoutes = new Hono<AppEnv>();
  internalRoutes.route("/", createGatewayRoutes());

  // Ops / DLQ routes (internal only)
  const ops = new Hono<AppEnv>();
  
  ops.get("/dlq/auth-events", async (c) => {
    const limit = c.req.query("limit") ? Number(c.req.query("limit")) : 25;
    const redis = getRedisConnection();
    if (!redis) {
      return c.json({ error: "Redis no disponible" }, 503);
    }
    const entries = await listAuthEventDlqEntries(redis, limit);
    return c.json(entries);
  });

  ops.post("/dlq/auth-events/replay", async (c) => {
    const redis = getRedisConnection();
    if (!redis) {
      return c.json({ error: "Redis no disponible" }, 503);
    }

    let body: any = {};
    try {
      body = await c.req.json();
    } catch {
      // Empty or invalid body is fine
    }

    const id = body?.id || c.req.query("id");
    if (id) {
      const result = await replayAuthEventDlqEntry(redis, id);
      return c.json({ id, ...result });
    } else {
      const entries = await listAuthEventDlqEntries(redis, 100);
      const results = [];
      for (const entry of entries) {
        try {
          const res = await replayAuthEventDlqEntry(redis, entry.id);
          results.push({ id: entry.id, success: true, ...res });
        } catch (err: any) {
          results.push({ id: entry.id, success: false, error: err.message });
        }
      }
      return c.json({ replayed: results });
    }
  });

  internalRoutes.route("/_ops", ops);
  app.route("/", internalRoutes);

  // --- (c) Grupo de Rutas Autenticadas (requieren JWT válido) ---
  const authenticatedRoutes = new Hono<AppEnv>();
  authenticatedRoutes.use("*", authMiddleware);
  authenticatedRoutes.route("/api/v1/collab", collabModuleRoutes);
  
  app.route("/", authenticatedRoutes);

  // --- Manejador Global de Errores ---
  app.onError(onError);

  // --- 404 ---
  app.notFound((c) => c.json({ error: "Ruta no encontrada" }, 404));

  return app;
};
