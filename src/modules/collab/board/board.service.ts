import { createBoardColumnService } from "./board-column.service";
import { createBoardTaskService } from "./board-task.service";
import { createBoardTaskInteractionService } from "./board-task-interaction.service";
import type { createBoardRepository } from "./board.repository";
import type { createProjectRepository } from "../project/project.repository";
import type { createMemberRepository } from "../member/member.repository";
import type { createFileRepository } from "../file/file.repository";

export { createBoardColumnService } from "./board-column.service";
export { createBoardTaskService } from "./board-task.service";
export { createBoardTaskInteractionService } from "./board-task-interaction.service";
export type { Actor, RequestMeta } from "./board.types";

export const createBoardService = (
  boardRepository: ReturnType<typeof createBoardRepository>,
  projectRepository: ReturnType<typeof createProjectRepository>,
  memberRepository: ReturnType<typeof createMemberRepository>,
  fileRepository: ReturnType<typeof createFileRepository>,
) => {
  const columnService = createBoardColumnService(
    boardRepository,
    projectRepository,
    memberRepository,
  );
  const taskService = createBoardTaskService(
    boardRepository,
    projectRepository,
    memberRepository,
  );
  const interactionService = createBoardTaskInteractionService(
    boardRepository,
    projectRepository,
    memberRepository,
    fileRepository,
  );

  return {
    ...columnService,
    ...taskService,
    ...interactionService,
  };
};
