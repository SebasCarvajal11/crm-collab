import { env } from "../config/env";
import { getLogger } from "../shared/logger";
import { runCollabOutbox } from "../jobs/run-collab-outbox";
import { startWorkerHealthcheck } from "../shared/worker-health";
import { pool } from "../db/connection";
import { getRedisConnection } from "../shared/redis";
import { serviceMetrics } from "../app";

const logger = getLogger();

logger.info(
  { intervalMs: env.COLLAB_OUTBOX_INTERVAL_MS, topic: "worker:collab-outbox" },
  "inicio collab outbox worker"
);

// Start worker healthcheck (monitoring both DB and Redis)
const healthcheck = startWorkerHealthcheck("collab-outbox-worker", {
  pool,
  redis: getRedisConnection(),
});

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
