import type { DbOrTx } from "../shared/db.types";
import { and, asc, eq, inArray, ne, notInArray, sql } from "drizzle-orm";
import { BadRequestError } from "../../../shared/middlewares/error-handler.middleware";
import { projectSubtasks } from "../../../db/schema";

export const loadSubtasksMap = async (conn: DbOrTx, taskIds: string[]) => {
  if (!taskIds.length) return new Map<string, any[]>();
  const subtasks = await conn
    .select()
    .from(projectSubtasks)
    .where(inArray(projectSubtasks.taskId, taskIds))
    .orderBy(asc(projectSubtasks.position), asc(projectSubtasks.createdAt));

  const subtasksByTask = new Map<string, any[]>();
  for (const s of subtasks) {
    if (!subtasksByTask.has(s.taskId)) subtasksByTask.set(s.taskId, []);
    subtasksByTask.get(s.taskId)!.push(s);
  }
  return subtasksByTask;
};

export const createBoardSubtaskRepository = (conn: DbOrTx) => ({
  loadSubtasksMap: (taskIds: string[]) => loadSubtasksMap(conn, taskIds),

  upsertSubtasks: async (taskId: string, subtasks: any[]) => {
    if (!subtasks.length) {
      await conn.delete(projectSubtasks).where(eq(projectSubtasks.taskId, taskId));
      return [];
    }

    const incomingIds = subtasks.map((s) => s.id).filter(Boolean) as string[];
    if (new Set(incomingIds).size !== incomingIds.length) {
      throw new BadRequestError("Una subtarea no puede aparecer más de una vez");
    }

    if (incomingIds.length > 0) {
      const foreignSubtasks = await conn
        .select({ id: projectSubtasks.id })
        .from(projectSubtasks)
        .where(and(ne(projectSubtasks.taskId, taskId), inArray(projectSubtasks.id, incomingIds)));
      if (foreignSubtasks.length > 0) {
        throw new BadRequestError("Una o más subtareas no pertenecen a la tarea");
      }
    }

    const existing = incomingIds.length > 0
      ? await conn
          .select({ id: projectSubtasks.id })
          .from(projectSubtasks)
          .where(and(eq(projectSubtasks.taskId, taskId), inArray(projectSubtasks.id, incomingIds)))
      : [];
    const existingIdSet = new Set(existing.map((s) => s.id));

    const deleteWhere = existingIdSet.size > 0
      ? and(eq(projectSubtasks.taskId, taskId), notInArray(projectSubtasks.id, Array.from(existingIdSet)))
      : eq(projectSubtasks.taskId, taskId);
    await conn.delete(projectSubtasks).where(deleteWhere);

    return conn
      .insert(projectSubtasks)
      .values(
        subtasks.map((s, i) => ({
          id: s.id && existingIdSet.has(s.id) ? s.id : undefined,
          taskId,
          title: s.title,
          isCompleted: s.isCompleted,
          assigneeSub: s.assigneeSub || null,
          position: s.position ?? i,
        })),
      )
      .onConflictDoUpdate({
        target: projectSubtasks.id,
        set: {
          title: sql`excluded.title`,
          isCompleted: sql`excluded.is_completed`,
          assigneeSub: sql`excluded.assignee_sub`,
          position: sql`excluded.position`,
          updatedAt: new Date(),
        },
      })
      .returning();
  },
});
