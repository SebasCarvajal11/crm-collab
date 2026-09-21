import type { DbOrTx } from "../shared/db.types";
import { and, asc, eq, sql } from "drizzle-orm";
import { projectTaskColumns } from "../../../db/schema";
import type { NewProjectTaskColumn, ProjectType } from "../collab.types";
import { defaultColumnsByType } from "../shared/constants";

export const createBoardColumnRepository = (conn: DbOrTx) => ({
  createTaskColumn: async (payload: NewProjectTaskColumn) => {
    const [row] = await conn.insert(projectTaskColumns).values(payload).returning();
    return row;
  },

  createTaskColumnAtPosition: async (payload: NewProjectTaskColumn) => {
    await conn
      .update(projectTaskColumns)
      .set({ position: sql`-(${projectTaskColumns.position}) - 1` })
      .where(
        and(
          eq(projectTaskColumns.projectId, payload.projectId),
          sql`${projectTaskColumns.position} >= ${payload.position}`,
          sql`${projectTaskColumns.position} >= 0`,
        ),
      );
    await conn
      .update(projectTaskColumns)
      .set({ position: sql`-(${projectTaskColumns.position})` })
      .where(
        and(
          eq(projectTaskColumns.projectId, payload.projectId),
          sql`${projectTaskColumns.position} < 0`,
        ),
      );
    return conn
      .insert(projectTaskColumns)
      .values(payload)
      .returning()
      .then(([row]) => row);
  },

  createDefaultTaskColumns: async (projectId: string, type: ProjectType) => {
    const columns = defaultColumnsByType(type);
    const values: NewProjectTaskColumn[] = columns.map((c) => ({
      projectId,
      key: c.key as never,
      title: c.title,
      position: c.position,
      isClientVisible: c.isClientVisible,
      isDefault: true,
    }));
    return conn.insert(projectTaskColumns).values(values).returning();
  },

  listTaskColumnsByProject: async (projectId: string, isClientVisible?: boolean) =>
    conn
      .select()
      .from(projectTaskColumns)
      .where(
        and(
          eq(projectTaskColumns.projectId, projectId),
          isClientVisible === undefined ? undefined : eq(projectTaskColumns.isClientVisible, isClientVisible),
        ),
      )
      .orderBy(asc(projectTaskColumns.position)),

  updateTaskColumnById: async (
    columnId: string,
    patch: Partial<Pick<NewProjectTaskColumn, "title" | "position" | "isClientVisible">>,
  ) => {
    const [row] = await conn
      .update(projectTaskColumns)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(projectTaskColumns.id, columnId))
      .returning();
    return row ?? null;
  },

  moveTaskColumnToPosition: async (
    column: { id: string; projectId: string; position: number },
    nextPosition: number,
  ) => {
    if (column.position === nextPosition) return;

    await conn
      .update(projectTaskColumns)
      .set({ position: -1 })
      .where(eq(projectTaskColumns.id, column.id));

    if (nextPosition > column.position) {
      await conn
        .update(projectTaskColumns)
        .set({ position: sql`-(${projectTaskColumns.position}) - 1` })
        .where(
          and(
            eq(projectTaskColumns.projectId, column.projectId),
            sql`${projectTaskColumns.position} > ${column.position}`,
            sql`${projectTaskColumns.position} <= ${nextPosition}`,
          ),
        );
      await conn
        .update(projectTaskColumns)
        .set({ position: sql`-(${projectTaskColumns.position}) - 2` })
        .where(
          and(
            eq(projectTaskColumns.projectId, column.projectId),
            sql`${projectTaskColumns.position} < -1`,
          ),
        );
    } else {
      await conn
        .update(projectTaskColumns)
        .set({ position: sql`-(${projectTaskColumns.position}) - 1` })
        .where(
          and(
            eq(projectTaskColumns.projectId, column.projectId),
            sql`${projectTaskColumns.position} >= ${nextPosition}`,
            sql`${projectTaskColumns.position} < ${column.position}`,
          ),
        );
      await conn
        .update(projectTaskColumns)
        .set({ position: sql`-(${projectTaskColumns.position})` })
        .where(
          and(
            eq(projectTaskColumns.projectId, column.projectId),
            sql`${projectTaskColumns.position} < -1`,
          ),
        );
    }

    await conn
      .update(projectTaskColumns)
      .set({ position: nextPosition, updatedAt: new Date() })
      .where(eq(projectTaskColumns.id, column.id));
  },

  findTaskColumnById: async (columnId: string) => {
    const [row] = await conn
      .select()
      .from(projectTaskColumns)
      .where(eq(projectTaskColumns.id, columnId))
      .limit(1);
    return row ?? null;
  },

  findTaskColumnByKey: async (projectId: string, key: string) => {
    const [row] = await conn
      .select()
      .from(projectTaskColumns)
      .where(and(eq(projectTaskColumns.projectId, projectId), eq(projectTaskColumns.key, key as any)))
      .limit(1);
    return row ?? null;
  },
});
