import type { DbOrTx } from "../shared/db.types";
import { createBoardColumnRepository } from "./board-column.repository";
import { createBoardSubtaskRepository } from "./board-subtask.repository";
import { createBoardTaskRepository } from "./board-task.repository";

export { createBoardColumnRepository } from "./board-column.repository";
export { createBoardSubtaskRepository } from "./board-subtask.repository";
export { createBoardTaskRepository } from "./board-task.repository";

export const createBoardRepository = (conn: DbOrTx) => ({
  ...createBoardColumnRepository(conn),
  ...createBoardSubtaskRepository(conn),
  ...createBoardTaskRepository(conn),
});
