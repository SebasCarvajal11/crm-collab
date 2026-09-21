import { ProjectTask, type TaskColumnKey } from "../domain/project-aggregate";
import { BadRequestError } from "../../../shared/middlewares/error-handler.middleware";

export interface TaskProgressParams {
  columnKey: TaskColumnKey;
  subtasks?: { id?: string; title: string; isCompleted: boolean; assigneeSub?: string | null }[];
  checklistProgress?: number;
  existingCompletedAt?: Date | null;
}

export function resolveTaskProgressAndCompletion(params: TaskProgressParams) {
  const hasSubtasks = Boolean(params.subtasks && params.subtasks.length > 0);
  let calculatedProgress = hasSubtasks
    ? ProjectTask.calculateChecklistProgress(params.subtasks!)
    : (params.checklistProgress ?? 0);

  const isFinal = ProjectTask.isFinalizationColumn(params.columnKey);

  if (isFinal && !hasSubtasks) {
    calculatedProgress = 100;
  } else if (!isFinal && !hasSubtasks && calculatedProgress === 100) {
    calculatedProgress = 0;
  }

  if (isFinal && hasSubtasks && calculatedProgress < 100) {
    throw new BadRequestError(
      "No puedes mover la tarea a la columna final sin completar todas las subtareas",
    );
  }

  const completedAt = ProjectTask.isCompleted(params.columnKey, calculatedProgress)
    ? params.existingCompletedAt ?? new Date()
    : null;

  return { calculatedProgress, completedAt };
}
