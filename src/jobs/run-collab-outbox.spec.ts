import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => {
  const pipeline = { xadd: vi.fn(), hincrby: vi.fn(), exec: vi.fn() };
  const redis = { pipeline: vi.fn(() => pipeline), hincrby: vi.fn() };
  const repository = {
    claimPendingCollabOutboxEvents: vi.fn(),
    countPendingCollabOutboxEvents: vi.fn(),
    markCollabOutboxPublished: vi.fn(),
    markCollabOutboxFailed: vi.fn(),
  };
  return { pipeline, redis, repository };
});

vi.mock("../db/connection", () => ({ db: {} }));
vi.mock("../shared/redis", () => ({ getRedisConnection: () => state.redis }));
vi.mock("../config/env", () => ({
  env: { COLLAB_OUTBOX_BATCH_SIZE: 50, REDIS_STREAMS_KEY: "stream:collab.events" },
}));
vi.mock("../shared/logger", () => ({
  getLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  traceStorage: { run: (_context: unknown, action: () => Promise<void>) => action() },
}));
vi.mock("../modules/collab/events/collab-outbox.repository", () => ({
  createCollabOutboxRepository: () => state.repository,
}));

import { runCollabOutbox } from "./run-collab-outbox";

describe("runCollabOutbox", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.redis.pipeline.mockReturnValue(state.pipeline);
    state.redis.hincrby.mockResolvedValue(1);
    state.repository.countPendingCollabOutboxEvents.mockResolvedValue(0);
    state.repository.markCollabOutboxPublished.mockResolvedValue([{ id: "event-1" }, { id: "event-2" }]);
    state.repository.markCollabOutboxFailed.mockResolvedValue(true);
  });

  it("claims a batch, pipelines its publications, and confirms them in one repository update", async () => {
    state.repository.claimPendingCollabOutboxEvents.mockResolvedValue([
      { id: "event-1", eventType: "project.created", payload: { version: 1 } },
      { id: "event-2", eventType: "project.updated", payload: { version: 1 } },
    ]);
    state.pipeline.exec.mockResolvedValue([[null, "1-0"], [null, "2-0"]]);

    await expect(runCollabOutbox()).resolves.toEqual({ processed: 2, failed: 0, pending: 0 });

    expect(state.repository.claimPendingCollabOutboxEvents).toHaveBeenCalledWith(expect.objectContaining({
      limit: 50,
      claimTimeoutMs: 60_000,
      claimToken: expect.any(String),
    }));
    expect(state.pipeline.xadd).toHaveBeenCalledTimes(2);
    expect(state.repository.markCollabOutboxPublished).toHaveBeenCalledWith(
      ["event-1", "event-2"],
      expect.any(String)
    );
    expect(state.repository.markCollabOutboxFailed).not.toHaveBeenCalled();
  });
});
