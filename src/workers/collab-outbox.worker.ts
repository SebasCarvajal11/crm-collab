import { env } from "../config/env";
import { getLogger } from "../shared/logger";
import { runCollabOutbox } from "../jobs/run-collab-outbox";
import { startWorkerHealthcheck } from "../shared/worker-health";
import { pool } from "../db/connection";
import { getRedisConnection, initRedis } from "../shared/redis";
import { serviceMetrics } from "../app";
import { pruneReadNotifications } from "../jobs/prune-notifications";
import { pruneExpiredMediaAccessCache } from "../jobs/prune-media-access-cache";

const logger = getLogger();

if (!env.REDIS_URL) {
  throw new Error("REDIS_URL es requerida para el worker de outbox de colaboración");
}

// Los workers se ejecutan en un proceso independiente del servidor HTTP, por
// lo que deben crear su propia conexión antes de consultar o publicar eventos.
initRedis(env.REDIS_URL);

logger.info(
  { intervalMs: env.COLLAB_OUTBOX_INTERVAL_MS, topic: "worker:collab-outbox" },
  "inicio collab outbox worker"
);

// Start worker healthcheck (monitoring both DB and Redis)
const healthcheck = startWorkerHealthcheck("collab-outbox-worker", {
  pool,
  redis: getRedisConnection(),
});
let lastNotificationPruneAt = 0;
let lastMediaAccessCachePruneAt = 0;

const tick = async () => {
  try {
    const { processed, failed, pending } = await runCollabOutbox();
    if (processed > 0 || failed > 0) {
      logger.info({ processed, failed, topic: "worker:collab-outbox" }, "ciclo completado");
    }
    // Actualizar gauge de profundidad de outbox (pendientes tras el tick)
    serviceMetrics.outboxDepthGauge.set(
      { worker: "collab-outbox" },
      pending ?? 0
    );
    if (Date.now() - lastNotificationPruneAt >= env.NOTIFICATION_RETENTION_INTERVAL_MS) {
      const removed = await pruneReadNotifications(env.NOTIFICATION_RETENTION_DAYS);
      lastNotificationPruneAt = Date.now();
      logger.info({ removed, retentionDays: env.NOTIFICATION_RETENTION_DAYS }, "notificaciones leídas depuradas");
    }
    if (Date.now() - lastMediaAccessCachePruneAt >= env.MEDIA_ACCESS_CACHE_PRUNE_INTERVAL_MS) {
      const removed = await pruneExpiredMediaAccessCache();
      lastMediaAccessCachePruneAt = Date.now();
      logger.info({ removed }, "caché expirada de accesos a media depurada");
    }
  } catch (err) {
    logger.error({ err, topic: "worker:collab-outbox" }, "error en ciclo");
  }
};

await tick();
const timer = setInterval(tick, env.COLLAB_OUTBOX_INTERVAL_MS);

const shutdown = () => {
  healthcheck.stop();
  clearInterval(timer);
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
