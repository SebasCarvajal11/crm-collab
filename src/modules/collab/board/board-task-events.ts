import type { DbOrTx } from "../shared/db.types";
import { collabEvents } from "../events";
import type { Actor, UpdateTaskInput } from "./board.types";

interface EmitTaskUpdateEventsParams {
  tx: DbOrTx;
  task: { id: string; projectId: string; columnId: string };
  updated: { id: string; title: string; assigneeSub: string | null; isClientVisible: boolean };
  currentColumn: { key: string };
  targetColumn: { key: string };
  actor: Actor;
  patch: UpdateTaskInput;
  isMovingFromBlocked: boolean;
  isMovingToBlocked: boolean;
  assigneeSubs: string[];
  previousAssigneeSubs: string[];
}

const emitTaskMovementEvents = async (params: EmitTaskUpdateEventsParams): Promise<void> => {
  const {
    tx,
    task,
    updated,
    currentColumn,
    targetColumn,
    actor,
    patch,
    isMovingFromBlocked,
    isMovingToBlocked,
    assigneeSubs,
  } = params;

  if (!patch.columnId || patch.columnId === task.columnId) return;

  await collabEvents.emit("task.moved", task.projectId, actor.sub, {
    taskId: task.id,
    taskTitle: updated.title,
    fromColumnKey: currentColumn.key,
    toColumnKey: targetColumn.key,
    assigneeSub: updated.assigneeSub ?? undefined,
    assigneeSubs,
    clientVisible: updated.isClientVisible,
  }, tx);

  if (isMovingFromBlocked) {
    await collabEvents.emit("task.unblocked", task.projectId, actor.sub, {
      taskId: task.id,
      taskTitle: updated.title,
      targetColumnKey: targetColumn.key,
      assigneeSubs,
      clientVisible: updated.isClientVisible,
    }, tx);
  }

  if (isMovingToBlocked) {
    await collabEvents.emit("task.blocked", task.projectId, actor.sub, {
      taskId: task.id,
      taskTitle: updated.title,
      blockReason: patch.blockReason?.trim() || "Impedimento interno",
      blockType: patch.blockType ?? "internal_impediment",
      assigneeSubs,
      clientVisible: updated.isClientVisible,
    }, tx);
  }
};

const emitTaskAssignmentEvents = async (params: EmitTaskUpdateEventsParams): Promise<void> => {
  const { tx, task, updated, actor, patch, previousAssigneeSubs } = params;
  if (patch.assignees === undefined) return;

  const newAssignees = patch.assignees.filter((candidate) => !previousAssigneeSubs.includes(candidate.userSub));
  for (const assignee of newAssignees) {
    if (assignee.userSub === actor.sub) continue;
    await collabEvents.emit("task.assigned", task.projectId, actor.sub, {
      taskId: task.id,
      taskTitle: updated.title,
      assigneeSub: assignee.userSub,
    }, tx);
  }
};

const emitTaskPropertiesUpdatedEvents = async (params: EmitTaskUpdateEventsParams): Promise<void> => {
  const { tx, task, updated, currentColumn, actor, patch, assigneeSubs } = params;
  if (patch.columnId && patch.columnId !== task.columnId) return;

  const changes: Record<string, unknown> = {};
  if (patch.title !== undefined) changes.title = patch.title;
  if (patch.description !== undefined) changes.description = patch.description;
  if (patch.priority !== undefined) changes.priority = patch.priority;
  if (patch.dueDate !== undefined) changes.dueDate = patch.dueDate;
  if (patch.checklistProgress !== undefined) changes.checklistProgress = patch.checklistProgress;
  if (patch.clientVisible !== undefined) changes.clientVisible = patch.clientVisible;
  if (patch.position !== undefined) changes.position = patch.position;
  if (patch.blockedByTaskId !== undefined) changes.blockedByTaskId = patch.blockedByTaskId;
  if (patch.subtasks !== undefined) changes.subtasksCount = patch.subtasks.length;
  if (patch.assignees !== undefined) changes.assigneesCount = patch.assignees.length;

  if (Object.keys(changes).length === 0) return;

  await collabEvents.emit("task.updated", task.projectId, actor.sub, {
    taskId: task.id,
    taskTitle: updated.title,
    columnId: task.columnId,
    columnKey: currentColumn.key,
    changes,
    assigneeSubs,
    clientVisible: updated.isClientVisible,
  }, tx);
};

export const emitTaskUpdateEvents = async (params: EmitTaskUpdateEventsParams): Promise<void> => {
  await emitTaskMovementEvents(params);
  await emitTaskPropertiesUpdatedEvents(params);
  await emitTaskAssignmentEvents(params);
};
