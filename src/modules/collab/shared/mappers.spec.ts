import { describe, expect, it } from "vitest";
import { buildMemberAssignmentMaps, buildTaskCountMap } from "./mappers";

describe("member assignment mappings", () => {
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
});
