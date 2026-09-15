import { beforeEach, describe, expect, it, vi } from "vitest";

const { getUserProfilesFromSnapshots } = vi.hoisted(() => ({
  getUserProfilesFromSnapshots: vi.fn(),
}));

vi.mock("../../../shared/identity-snapshot-store", () => ({ getUserProfilesFromSnapshots }));

import { allowedMentionRolesByActor, buildMemberAssignmentMaps, buildTaskCountMap, enrichProjectMembersWithProfiles, resolveAssigneeEmails } from "./mappers";

describe("member assignment mappings", () => {
  beforeEach(() => {
    getUserProfilesFromSnapshots.mockResolvedValue({ profiles: new Map(), missingSubs: [], replicaUnavailable: false });
  });

  it("limita las menciones de un cliente a los roles internos", () => {
    expect(allowedMentionRolesByActor("admin")).toEqual(["admin", "worker", "client"]);
    expect(allowedMentionRolesByActor("worker")).toEqual(["admin", "worker", "client"]);
    expect(allowedMentionRolesByActor("client")).toEqual(["admin", "worker"]);
  });

  it("resuelve correos desde la petición, membresía o réplica y rechaza faltantes", async () => {
    const repo = { listProjectMembers: vi.fn().mockResolvedValue([{ userSub: "member", userEmail: "member@example.test" }]) };
    await expect(resolveAssigneeEmails(repo as any, {} as any, "project", [])).resolves.toEqual([]);
    await expect(resolveAssigneeEmails(repo as any, {} as any, "project", [{ userSub: "request", userEmail: "request@example.test" }, { userSub: "member" }])).resolves.toEqual([
      { userSub: "request", userEmail: "request@example.test" }, { userSub: "member", userEmail: "member@example.test" },
    ]);
    getUserProfilesFromSnapshots.mockResolvedValueOnce({ profiles: new Map([["replica", { email: "replica@example.test" }]]) });
    await expect(resolveAssigneeEmails(repo as any, {} as any, "project", [{ userSub: "replica" }])).resolves.toEqual([{ userSub: "replica", userEmail: "replica@example.test" }]);
    await expect(resolveAssigneeEmails(repo as any, {} as any, "project", [{ userSub: "missing" }])).rejects.toMatchObject({ statusCode: 400 });
  });

  it("counts each task once when its primary and additional assignee are the same user", () => {
    const { taskCountBySub } = buildMemberAssignmentMaps(
      [{ taskId: "task-1", userSub: "user-1", userEmail: "user-1@example.com" }],
      [{ id: "task-1", assigneeSub: "user-1" }]
    );

    expect(taskCountBySub.get("user-1")).toBe(1);
  });

  it("uses database aggregate counts without depending on the loaded task page", () => {
    const taskCountBySub = buildTaskCountMap([
      { userSub: "user-1", taskCount: 2_345 },
      { userSub: "user-2", taskCount: 4 },
    ]);

    expect(taskCountBySub).toEqual(new Map([
      ["user-1", 2_345],
      ["user-2", 4],
    ]));
  });

  it("enriquece miembros con el perfil disponible y conserva datos locales", async () => {
    getUserProfilesFromSnapshots.mockResolvedValueOnce({
      profiles: new Map([["worker", { email: "profile@example.test", role: "worker", firstName: "Ada", lastName: "Lovelace", clientKind: null, companyName: null, profession: "Engineer" }]]),
      missingSubs: [], replicaUnavailable: false,
    });
    const members = await enrichProjectMembersWithProfiles({} as any, [{ projectId: "p", userSub: "worker", role: "worker", userEmail: null, lastSeenAt: null }], {} as any, [{ taskId: "task", userSub: "worker", userEmail: "assigned@example.test" }], [{ id: "task", assigneeSub: "worker" }]);
    expect(members[0]).toMatchObject({ email: "assigned@example.test", taskCount: 1, first_name: "Ada", profession: "Engineer" });
  });
});
