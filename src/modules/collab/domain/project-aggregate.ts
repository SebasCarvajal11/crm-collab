export type TaskColumnKey =
  | "pending"
  | "doing"
  | "internal_review"
  | "client_approval"
  | "blocked"
  | "done"
  | "art_approved"
  | "in_production"
  | "quality_control"
  | "shipped"
  | "completed"
  | "waiting_material"
  | "on_hold";

export type ProjectTaskSnapshot = {
  columnKey: TaskColumnKey;
  checklistProgress: number;
};

const FINALIZATION_COLUMN_KEYS = new Set<TaskColumnKey>(["done", "completed"]);

export class ProjectTask {
  readonly columnKey: TaskColumnKey;
  readonly checklistProgress: number;

  constructor(snapshot: ProjectTaskSnapshot) {
    this.columnKey = snapshot.columnKey;
    this.checklistProgress = snapshot.checklistProgress;
  }

  static calculateChecklistProgress(
    subtasks?: Array<{ isCompleted: boolean }> | null,
    fallbackProgress = 0,
  ) {
    if (subtasks === undefined || subtasks === null) return fallbackProgress;
    if (!subtasks.length) return 0;

    const completedCount = subtasks.filter((subtask) => subtask.isCompleted).length;
    return Math.round((completedCount / subtasks.length) * 100);
  }

  static isFinalizationColumn(columnKey: TaskColumnKey) {
    return FINALIZATION_COLUMN_KEYS.has(columnKey);
  }

  static isCompleted(columnKey: TaskColumnKey, checklistProgress: number) {
    return this.isFinalizationColumn(columnKey) && checklistProgress === 100;
  }
}
