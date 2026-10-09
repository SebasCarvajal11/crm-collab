import type { Actor, RequestMeta } from "./board.types";
import type { createAuditRepository } from "../repository/audit.repository";
import type { createBoardRepository } from "./board.repository";

export interface ResolveTaskColumnStateParams {
  isMovingFromBlocked: boolean;
  isMovingToBlocked: boolean;
  isMovingToClientApproval: boolean;
  targetColumnKey: string;
  blockReason?: string | null;
  blockType?: "client_timeout" | "internal_impediment" | null;
  actorSub: string;
}

export function resolveTaskColumnStatePatches(params: ResolveTaskColumnStateParams) {
  const unblockingPatch = params.isMovingFromBlocked
    ? { blockReason: null, blockType: null, blockedAt: null, blockedBySub: null }
    : {};

  const blockingPatch = params.isMovingToBlocked
    ? {
        blockReason: params.blockReason?.trim() || "Impedimento interno",
        blockType: params.blockType ?? ("internal_impediment" as const),
        blockedAt: new Date(),
        blockedBySub: params.actorSub,
      }
    : params.targetColumnKey === "blocked"
      ? {
          ...(params.blockReason !== undefined
            ? { blockReason: params.blockReason?.trim() || "Impedimento interno" }
            : {}),
          ...(params.blockType !== undefined && params.blockType !== null
            ? { blockType: params.blockType }
            : {}),
        }
      : {};

  const clientApprovalPatch = params.isMovingToClientApproval
    ? { clientApprovalRequestedAt: new Date(), isClientVisible: true }
    : {};

  return { unblockingPatch, blockingPatch, clientApprovalPatch };
}

export interface TaskUpdateAuditParams {
  auditRepo: ReturnType<typeof createAuditRepository>;
  txBoardRepository: ReturnType<typeof createBoardRepository>;
  actor: Actor;
  taskId: string;
  meta: RequestMeta;
  isMovingToBlocked: boolean;
  isMovingFromBlocked: boolean;
  resolutionComment?: string;
}

export async function logTaskUpdateAuditAndComments(params: TaskUpdateAuditParams): Promise<void> {
  const {
    auditRepo,
    txBoardRepository,
    actor,
    taskId,
    meta,
    isMovingToBlocked,
    isMovingFromBlocked,
    resolutionComment,
  } = params;
  const logAudit = (action: string) =>
    auditRepo.createAuditLog({
      actorSub: actor.sub,
      action,
      resourceType: "project_task",
      resourceId: taskId,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });

  await logAudit("project_task_updated");
  if (isMovingToBlocked) await logAudit("project_task_blocked");
  if (isMovingFromBlocked) {
    const trimmed = resolutionComment?.trim();
    if (trimmed) {
      await txBoardRepository.createTaskComment({
        taskId,
        authorSub: actor.sub,
        authorEmail: actor.email,
        content: `[Resolución de Bloqueo] ${trimmed}`,
      });
    }
    await logAudit("project_task_unblocked");
  }
}
