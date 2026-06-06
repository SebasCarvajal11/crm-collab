import { Hono } from "hono";
import { cors } from "hono/cors";
import { env } from "./config/env";
import { createOpenApiRoutes } from "./openapi/openapi.routes";
import { collabModuleRoutes } from "./modules/collab/index";
import { onError } from "./shared/middlewares/error-handler.middleware";
import type { AppEnv } from "./shared/middlewares/auth.middleware";
import { checkPostgres, checkRedis, buildHealthResponse } from "./shared/health";
import { pool } from "./db/connection";
import { getRedisConnection } from "./shared/redis";
import { initLogger } from "./shared/logger";
import { requestLoggerMiddleware } from "./shared/middlewares/request-logger.middleware";

const logger = initLogger("mod-collab");
const healthStartTime = Date.now();

export const createApp = () => {
  const app = new Hono<AppEnv>();

  app.use("*", requestLoggerMiddleware());

  if (env.MOD_COLLAB_CORS) {
    app.use(
      "*",
      cors({
        origin: env.CORS_ORIGIN,
        credentials: true,
      })
    );
  }

  app.route("/", createOpenApiRoutes());

  // --- API v1 routes ---
  const v1 = new Hono();
  v1.route("/collab", collabModuleRoutes);
  app.route("/api/v1", v1);

  // --- Rutas legacy (backward compatibility) ---
  app.route("/collab", collabModuleRoutes);

  app.get("/health", async (c) => {
    const [pg, redis] = await Promise.all([
      checkPostgres(pool),
      checkRedis(getRedisConnection()),
    ]);

    const { body, status } = buildHealthResponse("mod-collab", healthStartTime, [pg, redis]);
    return c.json(body, status);
  });

  app.onError(onError);
  app.notFound((c) => c.json({ error: "Ruta no encontrada" }, 404));
  return app;
};
