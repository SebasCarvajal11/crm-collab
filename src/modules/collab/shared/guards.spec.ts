import { describe, expect, it } from "vitest";
import { canEditBrief, canInternalChat, canManageProject, canMoveTasks, canReceiveMentionInChannel } from "./guards";

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
});
