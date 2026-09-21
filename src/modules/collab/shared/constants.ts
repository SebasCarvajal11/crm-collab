import type { ProjectType } from "../collab.types";

/** Máximo de tareas cargadas en workspace/board en una sola petición. */
export const PROJECT_BOARD_TASK_LIMIT = 2000;

export const BLOCKED_EXTENSIONS = new Set([
  ".exe", ".bat", ".cmd", ".sh", ".ps1", ".msi", ".dll", ".com",
  ".vbs", ".js", ".ts", ".jsx", ".tsx", ".py", ".rb", ".pl", ".php",
]);

export const BLOCKED_MIMES = new Set([
  "application/x-msdownload",
  "application/x-executable",
  "application/x-sh",
  "application/x-bat",
  "text/javascript",
  "application/javascript",
  "application/x-php",
]);

export const CLIENT_APPROVAL_TIMEOUT_HOURS = 48;
export const CLIENT_APPROVAL_TIMEOUT_MS = CLIENT_APPROVAL_TIMEOUT_HOURS * 60 * 60 * 1000;

export const DEFAULT_PROJECT_COLUMNS = [
  { key: "pending" as const, title: "Pendiente", position: 0, isClientVisible: false },
  { key: "doing" as const, title: "En Curso", position: 1, isClientVisible: true },
  { key: "internal_review" as const, title: "En Revisión Interna", position: 2, isClientVisible: false },
  { key: "client_approval" as const, title: "En Aprobación", position: 3, isClientVisible: true },
  { key: "blocked" as const, title: "Bloqueado", position: 4, isClientVisible: true },
  { key: "done" as const, title: "Terminado", position: 5, isClientVisible: true },
] as const;

export const defaultColumnsByType = (_type?: ProjectType) => DEFAULT_PROJECT_COLUMNS;
