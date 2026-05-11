import { serve } from "@hono/node-server";
import { env } from "./config/env";
import { pool } from "./db/connection";
import { setupDefaultEventHandlers } from "./modules/collab/events";

const { createApp } = await import("./app");

// Initialize event system
setupDefaultEventHandlers();
console.log("[mod-collab] Event system initialized");

const app = createApp();

let serverRef: ReturnType<typeof serve> | null = null;
let isShuttingDown = false;

const shutdown = async (signal: string) => {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`[shutdown] ${signal}: cerrando recursos de mod-collab`);

  if (serverRef) {
    await new Promise<void>((resolve, reject) => {
      serverRef?.close((err) => (err ? reject(err) : resolve()));
    }).catch((err) => console.error("[shutdown] server.close:", err));
    serverRef = null;
  }

  await pool.end().catch((err) => console.error("[shutdown] pool.end:", err));
  console.log("[shutdown] mod-collab finalizado");
};

const exitAfterShutdown = (signal: string) => {
  void shutdown(signal).finally(() => process.exit(0));
};

process.once("SIGINT", () => exitAfterShutdown("SIGINT"));
process.once("SIGTERM", () => exitAfterShutdown("SIGTERM"));

serverRef = serve(
  {
    fetch: app.fetch,
    port: env.PORT,
  },
  (info) => {
    console.log(`mod-collab escuchando en http://localhost:${info.port}`);
    console.log(`Entorno: ${env.NODE_ENV}`);
  }
);
