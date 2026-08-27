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
});
