import { describe, expect, it, vi } from "vitest";
import {
  resolveTaskColumnStatePatches,
  logTaskUpdateAuditAndComments,
} from "./board-task-patches";

describe("board-task-patches", () => {
  describe("resolveTaskColumnStatePatches", () => {
    it("genera parches correctos al mover una tarea hacia blocked", () => {
      const patches = resolveTaskColumnStatePatches({
        isMovingFromBlocked: false,
        isMovingToBlocked: true,
        isMovingToClientApproval: false,
        targetColumnKey: "blocked",
        blockReason: "Esperando confirmación",
        blockType: "client_timeout",
        actorSub: "sub-1",
      });

      expect(patches.unblockingPatch).toEqual({});
      expect(patches.clientApprovalPatch).toEqual({});
      expect(patches.blockingPatch).toEqual(
        expect.objectContaining({
          blockReason: "Esperando confirmación",
          blockType: "client_timeout",
          blockedBySub: "sub-1",
        })
      );
    });

    it("genera parches correctos al desbloquear una tarea hacia client_approval", () => {
      const patches = resolveTaskColumnStatePatches({
        isMovingFromBlocked: true,
        isMovingToBlocked: false,
        isMovingToClientApproval: true,
        targetColumnKey: "client_approval",
        actorSub: "sub-1",
      });

      expect(patches.unblockingPatch).toEqual({
        blockReason: null,
        blockType: null,
        blockedAt: null,
        blockedBySub: null,
      });
      expect(patches.clientApprovalPatch).toEqual(
        expect.objectContaining({
          isClientVisible: true,
        })
      );
    });
  });

  describe("logTaskUpdateAuditAndComments", () => {
    it("registra auditoría de desbloqueo y comentario de resolución", async () => {
      const mockCreateAuditLog = vi.fn().mockResolvedValue({});
      const mockCreateTaskComment = vi.fn().mockResolvedValue({});
      const auditRepo = { createAuditLog: mockCreateAuditLog } as any;
      const txBoardRepository = { createTaskComment: mockCreateTaskComment } as any;

      await logTaskUpdateAuditAndComments({
        auditRepo,
        txBoardRepository,
        actor: { sub: "sub-1", userId: "sub-1", role: "worker", email: "worker@cima.com" },
        taskId: "task-99",
        meta: { ipAddress: "127.0.0.1", userAgent: "vitest" },
        isMovingToBlocked: false,
        isMovingFromBlocked: true,
        resolutionComment: "Se resolvieron las dudas del cliente",
      });

      expect(mockCreateAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({ action: "project_task_updated", resourceId: "task-99" })
      );
      expect(mockCreateAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({ action: "project_task_unblocked", resourceId: "task-99" })
      );
      expect(mockCreateTaskComment).toHaveBeenCalledWith(
        expect.objectContaining({
          taskId: "task-99",
          content: "[Resolución de Bloqueo] Se resolvieron las dudas del cliente",
        })
      );
    });

    it("registra auditoría de bloqueo al mover tarea a blocked", async () => {
      const mockCreateAuditLog = vi.fn().mockResolvedValue({});
      const auditRepo = { createAuditLog: mockCreateAuditLog } as any;
      const txBoardRepository = { createTaskComment: vi.fn() } as any;

      await logTaskUpdateAuditAndComments({
        auditRepo,
        txBoardRepository,
        actor: { sub: "sub-1", userId: "sub-1", role: "worker", email: "worker@cima.com" },
        taskId: "task-100",
        meta: { ipAddress: "127.0.0.1", userAgent: "vitest" },
        isMovingToBlocked: true,
        isMovingFromBlocked: false,
      });

      expect(mockCreateAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({ action: "project_task_blocked", resourceId: "task-100" })
      );
    });

    it("no crea comentario de resolución cuando el comentario es espacio en blanco", async () => {
      const mockCreateAuditLog = vi.fn().mockResolvedValue({});
      const mockCreateTaskComment = vi.fn().mockResolvedValue({});
      const auditRepo = { createAuditLog: mockCreateAuditLog } as any;
      const txBoardRepository = { createTaskComment: mockCreateTaskComment } as any;

      await logTaskUpdateAuditAndComments({
        auditRepo,
        txBoardRepository,
        actor: { sub: "sub-1", userId: "sub-1", role: "worker", email: "worker@cima.com" },
        taskId: "task-101",
        meta: { ipAddress: "127.0.0.1", userAgent: "vitest" },
        isMovingToBlocked: false,
        isMovingFromBlocked: true,
        resolutionComment: "   ",
      });

      expect(mockCreateAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({ action: "project_task_unblocked", resourceId: "task-101" })
      );
      expect(mockCreateTaskComment).not.toHaveBeenCalled();
    });
  });
});
