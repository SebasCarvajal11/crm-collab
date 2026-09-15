import { describe, expect, it, vi } from "vitest";
import { assertProjectAccess, assertProjectMemberRoleCompatibility, assertWorkerOnlyAssignments } from "./project-access";

const actor = { sub: "actor", userId: "actor", role: "worker", email: "actor@example.test" };

describe("acceso y asignaciones de proyecto", () => {
  it("distingue proyecto inexistente, falta de membresía y acceso válido", async () => {
    const missingProject = { findProjectById: vi.fn().mockResolvedValue(null), findProjectMember: vi.fn(), listProjectMembers: vi.fn() };
    await expect(assertProjectAccess(missingProject, actor, "project")).rejects.toMatchObject({ statusCode: 404 });

    const missingMember = { findProjectById: vi.fn().mockResolvedValue({ id: "project" }), findProjectMember: vi.fn().mockResolvedValue(null), listProjectMembers: vi.fn() };
    await expect(assertProjectAccess(missingMember, actor, "project")).rejects.toMatchObject({ statusCode: 403 });

    const globalAdmin = { ...actor, role: "admin" };
    await expect(assertProjectAccess(missingMember, globalAdmin, "project")).resolves.toEqual({
      project: { id: "project" },
      member: { role: "admin" },
    });

    const repo = { findProjectById: vi.fn().mockResolvedValue({ id: "project" }), findProjectMember: vi.fn().mockResolvedValue({ role: "worker" }), listProjectMembers: vi.fn() };
    await expect(assertProjectAccess(repo, actor, "project")).resolves.toEqual({ project: { id: "project" }, member: { role: "worker" } });
  });

  it("solo permite asignar trabajo a administradores o workers", async () => {
    const repo = { listProjectMembers: vi.fn().mockResolvedValue([{ userSub: "admin", role: "admin" }, { userSub: "worker", role: "worker" }, { userSub: "client", role: "client" }]) };
    await expect(assertWorkerOnlyAssignments(repo as any, "project", { assignees: [{ userSub: "admin" }], subtasks: [{ assigneeSub: "worker" }, {}] })).resolves.toBeUndefined();
    await expect(assertWorkerOnlyAssignments(repo as any, "project", { assignees: [{ userSub: "client" }] })).rejects.toMatchObject({ statusCode: 400 });
    await expect(assertWorkerOnlyAssignments(repo as any, "project", { subtasks: [{ assigneeSub: "client" }] })).rejects.toMatchObject({ statusCode: 400 });
  });

  it.each([
    ["admin", "admin", true], ["admin", "worker", true], ["worker", "worker", true], ["client", "client", true],
    ["worker", "admin", false], ["client", "worker", false], ["admin", "client", false],
  ] as const)("valida compatibilidad %s -> %s", (identity, projectRole, valid) => {
    const action = () => assertProjectMemberRoleCompatibility(identity, projectRole);
    if (valid) expect(action).not.toThrow(); else expect(action).toThrow();
  });
});
