import type { ParentProjectStatus, ProjectType } from "../collab.types";

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
  | "waiting_material";

export type ProjectTaskSnapshot = {
  columnKey: TaskColumnKey;
  checklistProgress: number;
};

export type ProjectStatusSnapshot = {
  status: ParentProjectStatus;
  progressPercent: number;
};

const FINALIZATION_COLUMN_KEYS = new Set<TaskColumnKey>(["done", "completed"]);

const PROGRESS_BY_COLUMN: Record<TaskColumnKey, number> = {
  pending: 0,
  doing: 25,
  internal_review: 50,
  client_approval: 75,
  blocked: 10,
  done: 100,
  art_approved: 30,
  in_production: 60,
  quality_control: 80,
  shipped: 100,
  completed: 100,
  waiting_material: 10,
};

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

  getWeightedProgress(projectType: ProjectType) {
    if (projectType === "product_order") {
      if (this.columnKey === "shipped" || this.columnKey === "completed") return 100;
      if (this.columnKey === "quality_control") return 80;
      if (this.columnKey === "in_production") return 60;
      if (this.columnKey === "art_approved") return 30;
      return 0;
    }

    return PROGRESS_BY_COLUMN[this.columnKey] ?? 0;
  }
}

export class ProjectAggregate {
  constructor(
    private readonly type: ProjectType,
    private readonly tasks: ProjectTask[],
  ) {}

  static fromSnapshots(type: ProjectType, snapshots: ProjectTaskSnapshot[]) {
    return new ProjectAggregate(
      type,
      snapshots.map((snapshot) => new ProjectTask(snapshot)),
    );
  }

  createStatusSnapshot(): ProjectStatusSnapshot {
    if (!this.tasks.length) {
      return { status: "todo", progressPercent: 0 };
    }

    const allDone = this.tasks.every((task) => ProjectTask.isFinalizationColumn(task.columnKey));
    if (allDone) {
      return { status: "completed", progressPercent: 100 };
    }

    if (this.tasks.some((task) => task.columnKey === "client_approval" || task.columnKey === "quality_control")) {
      return {
        status: "in_review",
        progressPercent: this.calculateAverageProgress(),
      };
    }

    if (this.tasks.some((task) => task.columnKey !== "pending")) {
      return {
        status: "in_progress",
        progressPercent: this.calculateAverageProgress(),
      };
    }

    return {
      status: "todo",
      progressPercent: this.calculateAverageProgress(),
    };
  }

  private calculateAverageProgress() {
    const totalProgress = this.tasks.reduce(
      (carry, task) => carry + task.getWeightedProgress(this.type),
      0,
    );

    return Math.round(totalProgress / this.tasks.length);
  }
}
