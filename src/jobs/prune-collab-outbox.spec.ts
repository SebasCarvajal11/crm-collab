import { beforeEach, describe, expect, it, vi } from "vitest";

const { execute } = vi.hoisted(() => ({ execute: vi.fn() }));

vi.mock("../db/connection", () => ({ db: { execute } }));

import { prunePublishedCollabOutbox } from "./prune-collab-outbox";

describe("prunePublishedCollabOutbox", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deletes published outbox events in bounded batches until exhaustion", async () => {
    execute
      .mockResolvedValueOnce({ rowCount: 500 })
      .mockResolvedValueOnce({ rowCount: 500 })
      .mockResolvedValueOnce({ rowCount: 42 });

    const removed = await prunePublishedCollabOutbox({
      retentionDays: 7,
      now: new Date("2026-10-01T00:00:00.000Z"),
      batchSize: 500,
    });

    expect(removed).toBe(1042);
    expect(execute).toHaveBeenCalledTimes(3);
  });

  it("stops immediately if first batch yields zero deleted rows", async () => {
    execute.mockResolvedValueOnce({ rowCount: 0 });

    const removed = await prunePublishedCollabOutbox();

    expect(removed).toBe(0);
    expect(execute).toHaveBeenCalledTimes(1);
  });
});
