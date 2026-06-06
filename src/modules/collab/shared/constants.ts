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

export const defaultColumnsByType = (type: ProjectType) =>
  type === "campaign_service"
    ? [
        { key: "pending", title: "Pendiente", position: 0, isClientVisible: false },
        { key: "doing", title: "Haciendo", position: 1, isClientVisible: false },
        { key: "internal_review", title: "En Revisión Interna", position: 2, isClientVisible: false },
        { key: "client_approval", title: "En Aprobación Cliente", position: 3, isClientVisible: true },
        { key: "blocked", title: "Bloqueado", position: 4, isClientVisible: false },
        { key: "done", title: "Hecho", position: 5, isClientVisible: true },
      ]
    : [
        { key: "pending", title: "Pendiente", position: 0, isClientVisible: false },
        { key: "art_approved", title: "Arte Aprobado", position: 1, isClientVisible: true },
        { key: "in_production", title: "En Producción", position: 2, isClientVisible: false },
        { key: "quality_control", title: "En Control de Calidad", position: 3, isClientVisible: false },
        { key: "shipped", title: "Enviado", position: 4, isClientVisible: true },
        { key: "completed", title: "Completado", position: 5, isClientVisible: true },
        { key: "waiting_material", title: "Esperando Material", position: 6, isClientVisible: false },
      ];
