import { describe, expect, it } from "vitest";
import { ProjectTask } from "./project-aggregate";

describe("ProjectTask finalization", () => {
  it("calcula el avance de checklists vacíos, parciales y completos", () => {
    expect(ProjectTask.calculateChecklistProgress()).toBe(0);
    expect(ProjectTask.calculateChecklistProgress(null, 42)).toBe(42);
    expect(ProjectTask.calculateChecklistProgress([])).toBe(0);
    expect(ProjectTask.calculateChecklistProgress([{ isCompleted: true }, { isCompleted: false }, { isCompleted: true }])).toBe(67);
    expect(ProjectTask.calculateChecklistProgress([{ isCompleted: true }])).toBe(100);
  });

  it("keeps shipped product-order tasks at full progress without closing them before completed", () => {
    expect(ProjectTask.isFinalizationColumn("shipped")).toBe(false);
    expect(ProjectTask.isCompleted("shipped", 100)).toBe(false);
    expect(ProjectTask.isFinalizationColumn("completed")).toBe(true);
    expect(ProjectTask.isCompleted("completed", 100)).toBe(true);
  });

  it("solo finaliza columnas terminales con progreso completo", () => {
    expect(new ProjectTask({ columnKey: "done", checklistProgress: 100 }).columnKey).toBe("done");
    expect(ProjectTask.isFinalizationColumn("pending")).toBe(false);
    expect(ProjectTask.isCompleted("done", 99)).toBe(false);
    expect(ProjectTask.isCompleted("completed", 100)).toBe(true);
  });
});
