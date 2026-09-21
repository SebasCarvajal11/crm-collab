import { describe, expect, it } from "vitest";
import {
  canBlockTask,
  canEditBrief,
  canInternalChat,
  canManageProject,
  canMoveTasks,
  canReceiveMentionInChannel,
  canUnblockTask,
} from "./guards";

describe("guardas RBAC de colaboración", () => {
  it.each([
    ["admin", undefined, true],
    ["worker", "admin", true],
    ["worker", "worker", false],
    ["client", "client", false],
  ] as const)("canManageProject(%s, %s)", (globalRole, memberRole, expected) => {
    expect(canManageProject(globalRole, memberRole)).toBe(expected);
  });

  it.each([
    ["admin", undefined, true],
    ["worker", "admin", true],
    ["worker", "worker", true],
    ["client", "client", false],
  ] as const)("canMoveTasks(%s, %s)", (globalRole, memberRole, expected) => {
    expect(canMoveTasks(globalRole, memberRole)).toBe(expected);
    expect(canEditBrief(globalRole, memberRole)).toBe(expected);
  });

  it("separa el canal interno de los destinatarios externos", () => {
    expect(canInternalChat("worker", "worker")).toBe(true);
    expect(canInternalChat("client", "client")).toBe(false);
    expect(canReceiveMentionInChannel("internal", "client")).toBe(false);
    expect(canReceiveMentionInChannel("internal", "worker")).toBe(true);
    expect(canReceiveMentionInChannel("external", "client")).toBe(true);
  });

  it("valida permisos de bloqueo y desbloqueo segun tipo de bloqueo", () => {
    expect(canBlockTask("worker", "worker")).toBe(true);
    expect(canBlockTask("admin", "admin")).toBe(true);
    expect(canBlockTask("client", "client")).toBe(false);

    // Timeout de cliente: Solo admin o cliente pueden desbloquear
    expect(canUnblockTask("client", "client", "client_timeout", false)).toBe(true);
    expect(canUnblockTask("admin", undefined, "client_timeout", false)).toBe(true);
    expect(canUnblockTask("worker", "worker", "client_timeout", true)).toBe(false);

    // Impedimento interno: Solo admin o trabajador asignado pueden desbloquear
    expect(canUnblockTask("admin", undefined, "internal_impediment", false)).toBe(true);
    expect(canUnblockTask("worker", "worker", "internal_impediment", true)).toBe(true);
    expect(canUnblockTask("worker", "worker", "internal_impediment", false)).toBe(false);
    expect(canUnblockTask("client", "client", "internal_impediment", false)).toBe(false);
  });
});
