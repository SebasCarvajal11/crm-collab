import { beforeEach, describe, expect, it, vi } from "vitest";

const createCollabOutboxEvent = vi.fn();

vi.mock("../../../db/connection", () => ({ db: {} }));
vi.mock("./collab-outbox.repository", () => ({
  createCollabOutboxRepository: () => ({ createCollabOutboxEvent }),
}));
vi.mock("../../../shared/redis", () => ({ getRedisConnection: () => null }));

import { RedisStreamsEventBus } from "./redis-streams.event-bus";

describe("RedisStreamsEventBus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createCollabOutboxEvent.mockResolvedValue(undefined);
  });

  it("does not dispatch an event before the caller transaction commits", async () => {
    const bus = new RedisStreamsEventBus({} as any, {} as any);
    const handler = vi.fn();
    bus.onAny(handler);

    await bus.emit("project.created", "project-1", "admin-1", {
      projectId: "project-1",
      projectName: "Project",
      projectType: "campaign_service",
      clientName: "Client",
      adminResponsibleSub: "admin-1",
    }, {} as any);

    expect(createCollabOutboxEvent).toHaveBeenCalledOnce();
    expect(handler).not.toHaveBeenCalled();
  });

  it("dispatches immediately only when no transaction is supplied", async () => {
    const bus = new RedisStreamsEventBus({} as any, {} as any);
    const handler = vi.fn();
    bus.onAny(handler);

    await bus.emit("project.updated", "project-1", "admin-1", {
      projectId: "project-1",
      projectName: "Project",
    });

    expect(handler).toHaveBeenCalledOnce();
  });

  it("keeps a failed handler message pending so it can be reclaimed", async () => {
    const bus = new RedisStreamsEventBus({} as any, {} as any);
    bus.onAny(async () => { throw new Error("database unavailable"); });

    const acknowledged = await (bus as any).processMessage("1-0", [
      "payload",
      JSON.stringify({ id: "event-1", version: 1, type: "project.updated", projectId: "project-1", actorSub: "admin-1", data: {} }),
    ]);

    expect(acknowledged).toBe(false);
  });

  it("moves a repeatedly failing message to the DLQ and acknowledges it", async () => {
    const publisher = { xadd: vi.fn().mockResolvedValue("1-0") };
    const subscriber = { xpending: vi.fn().mockResolvedValue([["1-0", "consumer", 0, 3]]) };
    const bus = new RedisStreamsEventBus(publisher as any, subscriber as any);
    bus.onAny(async () => { throw new Error("invalid event data"); });

    const acknowledged = await (bus as any).processMessage("1-0", [
      "payload",
      JSON.stringify({ id: "event-1", version: 1, type: "project.updated", projectId: "project-1", actorSub: "admin-1", data: {} }),
    ]);

    expect(acknowledged).toBe(true);
    expect(publisher.xadd).toHaveBeenCalledWith(
      expect.any(String),
      "*",
      "sourceStream", expect.any(String),
      "sourceGroup", expect.any(String),
      "sourceMessageId", "1-0",
      "consumerId", expect.any(String),
      "failedAt", expect.any(String),
      "deliveryCount", "3",
      "errorName", "Error",
      "errorMessage", "invalid event data",
      "payload", expect.any(String),
      "rawFields", expect.any(String),
    );
  });

  it("acknowledges shutdown sentinels instead of leaving them in the pending list", async () => {
    const bus = new RedisStreamsEventBus({} as any, {} as any);

    await expect((bus as any).processMessage("1-0", ["__shutdown__", "1"])).resolves.toBe(true);
  });
});
