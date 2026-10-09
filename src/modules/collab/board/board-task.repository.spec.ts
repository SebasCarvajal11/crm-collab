import { describe, expect, it, vi } from "vitest";
import { createBoardTaskRepository } from "./board-task.repository";
import { createBoardSubtaskRepository, loadSubtasksMap } from "./board-subtask.repository";

describe("BoardSubtaskRepository", () => {
  it("loadSubtasksMap devuelve mapa vacío cuando taskIds está vacío", async () => {
    const mockConn = { select: vi.fn() } as any;
    const result = await loadSubtasksMap(mockConn, []);
    expect(result.size).toBe(0);
    expect(mockConn.select).not.toHaveBeenCalled();
  });

  it("upsertSubtasks elimina subtareas existentes si subtasks está vacío", async () => {
    const mockDeleteWhere = vi.fn().mockResolvedValue([]);
    const mockDelete = vi.fn().mockReturnValue({ where: mockDeleteWhere });
    const mockConn = { delete: mockDelete } as any;

    const repo = createBoardSubtaskRepository(mockConn);
    const result = await repo.upsertSubtasks("task-1", []);

    expect(result).toEqual([]);
    expect(mockDelete).toHaveBeenCalled();
  });

  it("upsertSubtasks lanza error si una subtarea aparece duplicada", async () => {
    const mockConn = {} as any;
    const repo = createBoardSubtaskRepository(mockConn);

    await expect(
      repo.upsertSubtasks("task-1", [
        { id: "sub-1", title: "Uno", isCompleted: false },
        { id: "sub-1", title: "Dos", isCompleted: true },
      ])
    ).rejects.toThrow("Una subtarea no puede aparecer más de una vez");
  });
});

describe("BoardTaskRepository - search query escaping", () => {
  it("sanitiza caracteres especiales de SQL LIKE (_, %, \\)", async () => {
    const mockSelect = vi.fn().mockReturnThis();
    const mockFrom = vi.fn().mockReturnThis();
    const mockWhere = vi.fn().mockReturnThis();
    const mockOrderBy = vi.fn().mockReturnThis();
    const mockLimit = vi.fn().mockResolvedValue([]);

    const mockConn = {
      select: mockSelect,
      from: mockFrom,
      where: mockWhere,
      orderBy: mockOrderBy,
      limit: mockLimit,
    } as any;
    mockSelect.mockReturnValue({ from: mockFrom });
    mockFrom.mockReturnValue({ where: mockWhere });
    mockWhere.mockReturnValue({ orderBy: mockOrderBy });
    mockOrderBy.mockReturnValue({ limit: mockLimit });

    const repo = createBoardTaskRepository(mockConn);
    const results = await repo.searchTasksByProject({
      projectId: "p-1",
      q: "test%_\\val",
      limit: 5,
    });

    expect(results).toEqual([]);
    expect(mockSelect).toHaveBeenCalled();
  });
});
