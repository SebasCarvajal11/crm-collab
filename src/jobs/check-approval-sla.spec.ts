import { beforeEach, describe, expect, it, vi } from "vitest";

const { execute } = vi.hoisted(() => ({ execute: vi.fn() }));
const { emit } = vi.hoisted(() => ({ emit: vi.fn() }));

vi.mock("../db/connection", () => ({ db: { execute } }));
vi.mock("../modules/collab/events", () => ({
  collabEvents: { emit },
}));

import { checkClientApprovalSla } from "./check-approval-sla";

describe("checkClientApprovalSla", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("identifica tareas vencidas de aprobación y emite evento de bloqueo", async () => {
    execute.mockResolvedValueOnce({
      rows: [
        {
          id: "task-uuid-1",
          project_id: "project-uuid-1",
          title: "Diseño de Landing Page",
        },
      ],
    });

    const result = await checkClientApprovalSla(48);

    expect(result.blockedCount).toBe(1);
    expect(result.taskIds).toEqual(["task-uuid-1"]);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledWith(
      "task.blocked",
      "project-uuid-1",
      expect.any(String),
      expect.objectContaining({
        taskId: "task-uuid-1",
        blockType: "client_timeout",
      }),
    );
  });

  it("retorna cero cuando no hay tareas que superen el SLA", async () => {
    execute.mockResolvedValueOnce({ rows: [] });

    const result = await checkClientApprovalSla(48);

    expect(result.blockedCount).toBe(0);
    expect(result.taskIds).toEqual([]);
    expect(emit).not.toHaveBeenCalled();
  });
});
