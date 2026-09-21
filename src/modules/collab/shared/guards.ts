import type { GlobalRole, ProjectMemberRole } from "../collab.types";

export const canManageProject = (globalRole: GlobalRole, memberRole?: ProjectMemberRole) =>
  globalRole === "admin" || memberRole === "admin";

export const canMoveTasks = (globalRole: GlobalRole, memberRole?: ProjectMemberRole) =>
  globalRole === "admin" || memberRole === "admin" || memberRole === "worker";

export const canInternalChat = (globalRole: GlobalRole, memberRole?: ProjectMemberRole) =>
  globalRole === "admin" || memberRole === "admin" || memberRole === "worker";

/** Workers assigned to a project may maintain its operational brief; clients remain read-only. */
export const canEditBrief = (globalRole: GlobalRole, memberRole?: ProjectMemberRole) =>
  globalRole === "admin" || memberRole === "admin" || memberRole === "worker";

export const canReceiveMentionInChannel = (channel: "internal" | "external", memberRole: ProjectMemberRole) =>
  channel === "internal" ? memberRole === "admin" || memberRole === "worker" : true;

export const canBlockTask = (globalRole: GlobalRole, memberRole?: ProjectMemberRole) =>
  globalRole === "admin" || memberRole === "admin" || memberRole === "worker";

export const canUnblockTask = (
  globalRole: GlobalRole,
  memberRole?: ProjectMemberRole,
  blockType?: string | null,
  isAssignee?: boolean,
) => {
  const isAdmin = globalRole === "admin" || memberRole === "admin";
  if (isAdmin) return true;

  if (blockType === "client_timeout") {
    const isClient = globalRole === "client" || memberRole === "client";
    return isClient;
  }

  if (blockType === "internal_impediment") {
    const isWorker = globalRole === "worker" || memberRole === "worker";
    return isWorker && (isAssignee ?? false);
  }

  return false;
};
