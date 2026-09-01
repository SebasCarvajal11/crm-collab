import { beforeEach, describe, expect, it, vi } from "vitest";

const { execute } = vi.hoisted(() => ({ execute: vi.fn() }));

vi.mock("../db/connection", () => ({ db: { execute } }));

import { pruneReadNotifications } from "./prune-notifications";

describe("pruneReadNotifications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deletes old read notifications in bounded batches without returning their IDs", async () => {
    execute
      .mockResolvedValueOnce({ rowCount: 1_000 })
      .mockResolvedValueOnce({ rowCount: 1_000 })
      .mockResolvedValueOnce({ rowCount: 12 })
      .mockResolvedValueOnce({ rowCount: 3 });

    await expect(pruneReadNotifications(180, new Date("2026-09-01T00:00:00.000Z"))).resolves.toBe(2_015);

    expect(execute).toHaveBeenCalledTimes(4);
    expect(execute).not.toHaveBeenCalledWith(expect.objectContaining({ returning: expect.anything() }));
  });
});
