import type { DbOrTx } from "../shared/db.types";
import { createBoardColumnRepository } from "./board-column.repository";
import { createBoardTaskRepository } from "./board-task.repository";

export { createBoardColumnRepository } from "./board-column.repository";
export { createBoardTaskRepository } from "./board-task.repository";

export const createBoardRepository = (conn: DbOrTx) => ({
  ...createBoardColumnRepository(conn),
  ...createBoardTaskRepository(conn),
});
