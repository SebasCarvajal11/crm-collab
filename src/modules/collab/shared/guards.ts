import type { GlobalRole, ProjectMemberRole } from "../collab.types";

export const canManageProject = (globalRole: GlobalRole, memberRole?: ProjectMemberRole) =>
  globalRole === "admin" || memberRole === "admin";

export const canMoveTasks = (globalRole: GlobalRole, memberRole?: ProjectMemberRole) =>
  globalRole === "admin" || memberRole === "admin" || memberRole === "worker";

export const canInternalChat = (globalRole: GlobalRole, memberRole?: ProjectMemberRole) =>
  globalRole === "admin" || memberRole === "admin" || memberRole === "worker";

export const canReceiveMentionInChannel = (channel: "internal" | "external", memberRole: ProjectMemberRole) =>
  channel === "internal" ? memberRole === "admin" || memberRole === "worker" : true;
