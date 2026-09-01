import { beforeEach, describe, expect, it, vi } from "vitest";

const { execute } = vi.hoisted(() => ({ execute: vi.fn() }));

vi.mock("../db/connection", () => ({ db: { execute } }));

import { pruneExpiredMediaAccessCache } from "./prune-media-access-cache";

describe("pruneExpiredMediaAccessCache", () => {
  beforeEach(() => vi.clearAllMocks());

  it("removes expired entries in bounded batches", async () => {
    execute
      .mockResolvedValueOnce({ rowCount: 1_000 })
      .mockResolvedValueOnce({ rowCount: 12 });

    await expect(pruneExpiredMediaAccessCache(new Date("2026-09-01T00:00:00.000Z"))).resolves.toBe(1_012);
    expect(execute).toHaveBeenCalledTimes(2);
  });
});
