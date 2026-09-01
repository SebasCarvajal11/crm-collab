import { describe, expect, it } from "vitest";
import { ProjectTask } from "./project-aggregate";

describe("ProjectTask finalization", () => {
  it("keeps shipped product-order tasks at full progress without closing them before completed", () => {
    expect(ProjectTask.isFinalizationColumn("shipped")).toBe(false);
    expect(ProjectTask.isCompleted("shipped", 100)).toBe(false);
    expect(ProjectTask.isFinalizationColumn("completed")).toBe(true);
    expect(ProjectTask.isCompleted("completed", 100)).toBe(true);
  });
});
