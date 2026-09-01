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
});
