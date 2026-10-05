import { fileURLToPath } from "node:url";
import path from "node:path";
import { env } from "../config/env";
import { getLogger } from "../shared/logger";
import { runCollabOutbox } from "../jobs/run-collab-outbox";
import { startWorkerHealthcheck } from "../shared/worker-health";
import { pool } from "../db/connection";
import {
  closeRedisConnections,
  getRedisConnection,
  initRedis,
} from "../shared/redis";
import { serviceMetrics } from "../app";
import { pruneReadNotifications } from "../jobs/prune-notifications";
import { pruneExpiredMediaAccessCache } from "../jobs/prune-media-access-cache";
import { prunePublishedCollabOutbox } from "../jobs/prune-collab-outbox";
import { checkClientApprovalSla } from "../jobs/check-approval-sla";

const logger = getLogger();

interface CollabWorkerState {
  timer?: NodeJS.Timeout;
  healthcheck?: ReturnType<typeof startWorkerHealthcheck>;
  isTicking: boolean;
  isShuttingDown: boolean;
  lastNotificationPruneAt: number;
  lastMediaAccessCachePruneAt: number;
  lastOutboxPruneAt: number;
  lastSlaCheckAt: number;
}

const state: CollabWorkerState = {
  isTicking: false,
  isShuttingDown: false,
  lastNotificationPruneAt: 0,
  lastMediaAccessCachePruneAt: 0,
  lastOutboxPruneAt: 0,
  lastSlaCheckAt: 0,
};

async function runMaintenanceTasks(): Promise<void> {
  const now = Date.now();
  if (now - state.lastNotificationPruneAt >= env.NOTIFICATION_RETENTION_INTERVAL_MS) {
    const removed = await pruneReadNotifications(env.NOTIFICATION_RETENTION_DAYS);
    state.lastNotificationPruneAt = now;
    logger.info(
      { removed, retentionDays: env.NOTIFICATION_RETENTION_DAYS },
      "notificaciones leídas depuradas",
    );
  }

  if (now - state.lastMediaAccessCachePruneAt >= env.MEDIA_ACCESS_CACHE_PRUNE_INTERVAL_MS) {
    const removed = await pruneExpiredMediaAccessCache();
    state.lastMediaAccessCachePruneAt = now;
    logger.info({ removed }, "caché expirada de accesos a media depurada");
  }

  if (now - state.lastOutboxPruneAt >= env.COLLAB_OUTBOX_PRUNE_INTERVAL_MS) {
    const removed = await prunePublishedCollabOutbox({
      retentionDays: env.COLLAB_OUTBOX_RETENTION_DAYS,
    });
    state.lastOutboxPruneAt = now;
    if (removed > 0) {
      logger.info(
        { removed, retentionDays: env.COLLAB_OUTBOX_RETENTION_DAYS },
        "eventos publicados de outbox depurados",
      );
    }
  }

  if (now - state.lastSlaCheckAt >= 60_000) {
    const { blockedCount } = await checkClientApprovalSla();
    state.lastSlaCheckAt = now;
    if (blockedCount > 0) {
      logger.warn(
        { blockedCount },
        "tareas bloqueadas automáticamente por timeout de SLA",
      );
    }
  }
}

async function tick(): Promise<void> {
  if (state.isTicking || state.isShuttingDown) return;
  state.isTicking = true;
  try {
    const { processed, failed, pending } = await runCollabOutbox();
    if (processed > 0 || failed > 0) {
      logger.info({ processed, failed, topic: "worker:collab" }, "ciclo completado");
    }
    serviceMetrics.outboxDepthGauge.set(
      { worker: "collab-outbox" },
      pending ?? 0,
    );

    await runMaintenanceTasks();
  } catch (err) {
    logger.error({ err, topic: "worker:collab" }, "error en ciclo");
  } finally {
    state.isTicking = false;
  }
}

export async function startCollabWorker(): Promise<void> {
  state.isShuttingDown = false;
  if (!env.REDIS_URL) {
    throw new Error("REDIS_URL es requerida para el collab worker");
  }

  initRedis(env.REDIS_URL);

  logger.info(
    { intervalMs: env.COLLAB_OUTBOX_INTERVAL_MS, topic: "worker:collab" },
    "Collab worker iniciado",
  );

  state.healthcheck = startWorkerHealthcheck("collab-worker", {
    pool,
    redis: getRedisConnection(),
  });

  await tick();
  state.timer = setInterval(tick, env.COLLAB_OUTBOX_INTERVAL_MS);
}

export async function stopCollabWorker(): Promise<void> {
  state.isShuttingDown = true;

  if (state.timer) {
    clearInterval(state.timer);
  }

  const deadline = Date.now() + 5000;
  while (state.isTicking && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  if (state.healthcheck) {
    state.healthcheck.stop();
  }

  await closeRedisConnections();
  await pool.end().catch(() => undefined);
  logger.info({ topic: "worker:collab" }, "Collab worker detenido");
}

const isDirectRun = Boolean(
  process.argv[1] &&
    fileURLToPath(import.meta.url) === path.resolve(process.argv[1]),
);

if (isDirectRun) {
  const shutdown = async () => {
    await stopCollabWorker();
    process.exit(0);
  };

  process.once("SIGINT", () => void shutdown());
  process.once("SIGTERM", () => void shutdown());

  await startCollabWorker();
}
