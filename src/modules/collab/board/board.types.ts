import type { GlobalRole } from "../collab.types";

export type Actor = {
  sub: string;
  userId: string;
  role: GlobalRole;
  email: string;
  bearerToken?: string;
};

export type RequestMeta = {
  ipAddress: string;
  userAgent: string;
};

export interface TaskAssigneeInput {
  userSub: string;
  userEmail?: string;
}

export interface TaskSubtaskInput {
  id?: string;
  title: string;
  isCompleted: boolean;
  assigneeSub?: string | null;
}

export interface CreateTaskInput {
  columnId: string;
  title: string;
  description?: string;
  priority: "low" | "medium" | "high" | "urgent";
  assignees?: TaskAssigneeInput[];
  dueDate?: Date | null;
  checklistProgress: number;
  blockedByTaskId?: string | null;
  clientVisible: boolean;
  position: number;
  subtasks?: TaskSubtaskInput[];
}

export interface UpdateTaskInput {
  columnId?: string;
  title?: string;
  description?: string | null;
  priority?: "low" | "medium" | "high" | "urgent";
  assignees?: TaskAssigneeInput[];
  dueDate?: Date | null;
  checklistProgress?: number;
  blockedByTaskId?: string | null;
  clientVisible?: boolean;
  position?: number;
  subtasks?: TaskSubtaskInput[];
  blockReason?: string | null;
  blockType?: "client_timeout" | "internal_impediment" | null;
}

