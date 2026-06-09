import { serve } from "@hono/node-server";
import { env } from "./config/env";
import { pool } from "./db/connection";
import { ensureAuditLogPartitions } from "./db/scripts/ensure-audit-log-partitions";
import { setupDefaultEventHandlers, getEventBus } from "./modules/collab/events";
import { startAuthEventConsumer } from "./modules/collab/events/auth-event-handler";
import { startAuthDlqReplayer, stopAuthDlqReplayer } from "./modules/collab/events/auth-events-dlq";
import { startMediaResponseConsumer, stopMediaResponseConsumer } from "./shared/media-command-client";
import { closeRedisConnections, initRedis } from "./shared/redis";
import { getLogger } from "./shared/logger";

if (process.env.REDIS_URL) initRedis(process.env.REDIS_URL);

const logger = getLogger();

await ensureAuditLogPartitions(pool).catch((err) =>
  logger.error({ err }, "[audit_logs] ensure partitions failed"),
);

const { createApp } = await import("./app");

// Initialize event system
await setupDefaultEventHandlers();
logger.info("[mod-collab] Event system initialized");

// Initialize auth identity consumer (best-effort; survives without Redis)
void startAuthEventConsumer().catch((err) =>
  logger.error({ err }, "[mod-collab] Auth event consumer failed to start")
);
startAuthDlqReplayer();
void startMediaResponseConsumer().catch((err) =>
  logger.error({ err }, "[mod-collab] Media response consumer failed to start")
);

const app = createApp();

let serverRef: ReturnType<typeof serve> | null = null;
let isShuttingDown = false;

const shutdown = async (signal: string) => {
  if (isShuttingDown) return;
  isShuttingDown = true;
  logger.info({ signal }, "[shutdown] cerrando recursos de mod-collab");

  if (serverRef) {
    await new Promise<void>((resolve, reject) => {
      serverRef?.close((err) => (err ? reject(err) : resolve()));
    }).catch((err) => logger.error({ err }, "[shutdown] server.close"));
    serverRef = null;
  }

  await getEventBus().disconnect().catch((err) => logger.error({ err }, "[shutdown] eventBus.disconnect"));
  const { stopAuthEventConsumer } = await import("./modules/collab/events/auth-event-handler");
  await stopAuthEventConsumer().catch((err) => logger.error({ err }, "[shutdown] authEventConsumer.stop"));
  stopAuthDlqReplayer();
  await stopMediaResponseConsumer().catch((err) => logger.error({ err }, "[shutdown] mediaResponseConsumer.stop"));
  await closeRedisConnections();
  await pool.end().catch((err) => logger.error({ err }, "[shutdown] pool.end"));
  logger.info("[shutdown] mod-collab finalizado");
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
    logger.info({ port: info.port }, "server started");
    logger.info({ env: env.NODE_ENV }, "entorno");
  }
);
