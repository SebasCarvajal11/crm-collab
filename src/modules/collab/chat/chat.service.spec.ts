import { describe, expect, it, vi } from "vitest";

vi.mock("../../../db/connection", () => ({ db: { transaction: vi.fn() } }));
vi.mock("../events", () => ({ collabEvents: { emit: vi.fn() } }));
vi.mock("../../../shared/identity-snapshot-store", () => ({
  getUserProfilesFromSnapshots: vi.fn().mockResolvedValue({ profiles: new Map() }),
}));

import { createChatService } from "./chat.service";

describe("ChatService.listChatMessages", () => {
  it("does not update member activity during a read-only chat refresh", async () => {
    const memberRepository = {
      findProjectMember: vi.fn().mockResolvedValue({ role: "worker" }),
      listProjectMembers: vi.fn().mockResolvedValue([]),
      touchProjectMemberActivity: vi.fn(),
    };
    const service = createChatService(
      {
        listChatMessagesByChannel: vi.fn().mockResolvedValue({ rows: [], total: 0 }),
        listChatReadsByMessages: vi.fn().mockResolvedValue([]),
      } as any,
      { findProjectById: vi.fn().mockResolvedValue({ id: "project-1" }) } as any,
      memberRepository as any,
      {} as any
    );

    await service.listChatMessages(
      { sub: "user-1", userId: "user-1", role: "worker", email: "user@example.com" },
      "project-1",
      "external",
      { page: 1, limit: 20 }
    );

    expect(memberRepository.touchProjectMemberActivity).not.toHaveBeenCalled();
  });

  it("returns read receipts with readAt timestamps in readStatus", async () => {
    const readDate = new Date("2026-09-18T10:00:00.000Z");
    const service = createChatService(
      {
        listChatMessagesByChannel: vi.fn().mockResolvedValue({
          rows: [
            {
              id: "msg-1",
              projectId: "proj-1",
              channel: "external",
              authorSub: "author-1",
              body: "Hola equipo",
              createdAt: new Date(),
            },
          ],
          total: 1,
        }),
        listChatReadsByMessages: vi.fn().mockResolvedValue([
          { messageId: "msg-1", userSub: "reader-1", readAt: readDate },
        ]),
      } as any,
      { findProjectById: vi.fn().mockResolvedValue({ id: "proj-1" }) } as any,
      {
        findProjectMember: vi.fn().mockResolvedValue({ role: "worker" }),
        listProjectMembers: vi.fn().mockResolvedValue([
          { userSub: "author-1", role: "worker" },
          { userSub: "reader-1", role: "worker" },
          { userSub: "reader-2", role: "client" },
        ]),
        touchProjectMemberActivity: vi.fn(),
      } as any,
      {} as any
    );

    const result = await service.listChatMessages(
      { sub: "author-1", userId: "author-1", role: "worker", email: "author@example.com" },
      "proj-1",
      "external",
      { page: 1, limit: 20 }
    );

    expect(result.items).toHaveLength(1);
    const msg = result.items[0];
    expect(msg.readStatus).toBeDefined();
    expect(msg.readStatus.requiredCount).toBe(2);
    expect(msg.readStatus.seenCount).toBe(1);
    expect(msg.readStatus.isSeen).toBe(false);
    expect(msg.readStatus.reads).toEqual([
      { userSub: "reader-1", readAt: readDate.toISOString() },
    ]);
  });
});
