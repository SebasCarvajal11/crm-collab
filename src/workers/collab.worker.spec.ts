import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  runCollabOutbox: vi.fn(),
  pruneReadNotifications: vi.fn(),
  pruneExpiredMediaAccessCache: vi.fn(),
  prunePublishedCollabOutbox: vi.fn(),
  checkClientApprovalSla: vi.fn(),
  startWorkerHealthcheck: vi.fn(),
  healthcheckStop: vi.fn(),
  initRedis: vi.fn(),
  getRedisConnection: vi.fn(),
  closeRedisConnections: vi.fn(),
  poolEnd: vi.fn(),
}));

vi.mock("../config/env", () => ({
  env: {
    REDIS_URL: "redis://localhost:6379",
    COLLAB_OUTBOX_INTERVAL_MS: 5000,
    NOTIFICATION_RETENTION_INTERVAL_MS: 86400000,
    NOTIFICATION_RETENTION_DAYS: 30,
    MEDIA_ACCESS_CACHE_PRUNE_INTERVAL_MS: 3600000,
    COLLAB_OUTBOX_PRUNE_INTERVAL_MS: 86400000,
    COLLAB_OUTBOX_RETENTION_DAYS: 7,
  },
}));

vi.mock("../jobs/run-collab-outbox", () => ({
  runCollabOutbox: mocks.runCollabOutbox,
}));

vi.mock("../jobs/prune-notifications", () => ({
  pruneReadNotifications: mocks.pruneReadNotifications,
}));

vi.mock("../jobs/prune-media-access-cache", () => ({
  pruneExpiredMediaAccessCache: mocks.pruneExpiredMediaAccessCache,
}));

vi.mock("../jobs/prune-collab-outbox", () => ({
  prunePublishedCollabOutbox: mocks.prunePublishedCollabOutbox,
}));

vi.mock("../jobs/check-approval-sla", () => ({
  checkClientApprovalSla: mocks.checkClientApprovalSla,
}));

vi.mock("../shared/worker-health", () => ({
  startWorkerHealthcheck: mocks.startWorkerHealthcheck.mockReturnValue({
    stop: mocks.healthcheckStop,
  }),
}));

vi.mock("../db/connection", () => ({
  pool: { end: mocks.poolEnd },
}));

vi.mock("../shared/redis", () => ({
  initRedis: mocks.initRedis,
  getRedisConnection: mocks.getRedisConnection,
  closeRedisConnections: mocks.closeRedisConnections,
}));

vi.mock("../app", () => ({
  serviceMetrics: {
    outboxDepthGauge: { set: vi.fn() },
  },
}));

import { startCollabWorker, stopCollabWorker } from "./collab.worker";

describe("collab.worker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.runCollabOutbox.mockResolvedValue({ processed: 1, failed: 0, pending: 0 });
    mocks.pruneReadNotifications.mockResolvedValue(0);
    mocks.pruneExpiredMediaAccessCache.mockResolvedValue(0);
    mocks.prunePublishedCollabOutbox.mockResolvedValue(0);
    mocks.checkClientApprovalSla.mockResolvedValue({ blockedCount: 0 });
    mocks.closeRedisConnections.mockResolvedValue(undefined);
    mocks.poolEnd.mockResolvedValue(undefined);
  });

  it("inicia outbox, healthcheck y tareas de mantenimiento", async () => {
    await startCollabWorker();

    expect(mocks.initRedis).toHaveBeenCalledWith("redis://localhost:6379");
    expect(mocks.startWorkerHealthcheck).toHaveBeenCalledWith(
      "collab-worker",
      expect.any(Object),
    );
    expect(mocks.runCollabOutbox).toHaveBeenCalled();

    await stopCollabWorker();
    expect(mocks.healthcheckStop).toHaveBeenCalled();
    expect(mocks.closeRedisConnections).toHaveBeenCalled();
    expect(mocks.poolEnd).toHaveBeenCalled();
  });

  it("tolera errores en el ciclo de outbox sin abortar el worker", async () => {
    mocks.runCollabOutbox.mockRejectedValueOnce(new Error("Collab outbox DB error"));

    await expect(startCollabWorker()).resolves.not.toThrow();
    await stopCollabWorker();
  });
});
