import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { env } from "./config/env";
import { createOpenApiRoutes } from "./openapi/openapi.routes";
import { collabRoutes } from "./modules/collab/collab.routes";
import { onError } from "./shared/middlewares/error-handler.middleware";
import type { AppEnv } from "./shared/middlewares/auth.middleware";

export const createApp = () => {
  const app = new Hono<AppEnv>();

  app.use("*", logger());

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
  app.route("/collab", collabRoutes);
  app.get("/health", (c) => c.json({ status: "ok", service: "mod-collab" }));
  app.onError(onError);
  app.notFound((c) => c.json({ error: "Ruta no encontrada" }, 404));
  return app;
};
