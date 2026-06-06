import { BadRequestError } from "../../../shared/middlewares/error-handler.middleware";
import {
  getMediaDocumentMetadata,
  type MediaCommandActor,
} from "../../../shared/media-command-client";
import { env } from "../../../config/env";
import { BLOCKED_EXTENSIONS, BLOCKED_MIMES } from "./constants";

export const isCollabManagedStoragePath = (storagePath: string) => storagePath.startsWith("projects/");

export const assertAllowedUploadMime = (mimeType: string, fileName: string) => {
  const ext = fileName.slice(fileName.lastIndexOf(".")).toLowerCase();
  if (BLOCKED_EXTENSIONS.has(ext)) throw new BadRequestError("Tipo de archivo no permitido");
  if (BLOCKED_MIMES.has(mimeType)) throw new BadRequestError("Tipo de archivo no permitido");
};

export const assertProductionObjectRegistered = async (
  actor: MediaCommandActor,
  projectId: string,
  storagePath: string,
  fileName: string,
  mimeType: string,
  sizeBytes: number,
  taskId?: string,
): Promise<{ sizeBytes: number; mimeType: string }> => {
  const projectPrefix = `projects/${projectId}/`;
  if (!storagePath.startsWith(projectPrefix)) {
    throw new BadRequestError("storage_path no pertenece al proyecto");
  }
  if (taskId) {
    const taskPrefix = `projects/${projectId}/tasks/${taskId}/`;
    if (!storagePath.startsWith(taskPrefix)) {
      throw new BadRequestError("storage_path no pertenece a la tarea");
    }
  }

  return getMediaDocumentMetadata(actor, storagePath, fileName, mimeType, sizeBytes);
};

export const calculateUploadTtl = (sizeBytes: number): number => {
  const baseTtl = env.DOC_PAR_TTL_SECONDS;
  const calculatedTtl = Math.ceil(sizeBytes / (25 * 1024));
  return Math.min(3600, Math.max(baseTtl, calculatedTtl));
};
