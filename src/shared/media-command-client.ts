import { randomUUID } from "crypto";
import { and, eq, gt, sql } from "drizzle-orm";
import { env } from "../config/env";
import { db } from "../db/connection";
import { mediaAccessCache } from "../db/schema";
import { AppError } from "./middlewares/error-handler.middleware";
import { getLogger, traceStorage } from "./logger";
import { signServiceJwt } from "../config/jwt";
import {
  mediaResponseSchema,
  type MediaResponse,
} from "@sebascarvajal11/cima-contracts/media-asset-events";

const logger = getLogger();

import {
  type MediaCommandActor,
  type UnsignedMediaCommandRequest,
  type MediaCommandRequest,
  type MediaCommandResponse,
  type PendingResponse,
} from "./media-command.types";
import { SimpleCircuitBreaker, mediaCircuitBreaker } from "./circuit-breaker";

export type {
  MediaCommandActor,
  UnsignedMediaCommandRequest,
  MediaCommandRequest,
  MediaCommandResponse,
};
export { SimpleCircuitBreaker, mediaCircuitBreaker };

const CACHE_SAFETY_WINDOW_MS = 15_000;

export async function startMediaResponseConsumer(): Promise<void> {
  // No-op: Comandos de media ahora se resuelven síncronamente vía HTTP M2M (ADR-007)
}

export async function stopMediaResponseConsumer(): Promise<void> {
  // No-op: Comandos de media ahora se resuelven síncronamente vía HTTP M2M (ADR-007)
}

export async function getMediaDocumentAccessUrl(
  actor: MediaCommandActor,
  objectKey: string,
  forceDownload: boolean,
) {
  const cached = await getCachedAccessUrl(objectKey, forceDownload);
  if (cached) return cached;

  const response = await sendMediaCommand({
    type: "file.access-requested",
    correlationId: randomUUID(),
    requestedAt: new Date().toISOString(),
    actor,
    objectKey,
    forceDownload,
  });

  if (response.type !== "file.access-granted") {
    throw commandFailureToAppError(response);
  }

  await cacheAccessUrl(
    response.objectKey,
    forceDownload,
    response.url,
    response.expiresInSeconds,
  );

  return { url: response.url, expiresInSeconds: response.expiresInSeconds };
}

export async function createMediaDocumentUploadUrl(
  actor: MediaCommandActor,
  objectKey: string,
  fileName: string,
  mimeType: string,
  sizeBytes: number,
) {
  const response = await sendMediaCommand({
    type: "file.upload-url-requested",
    correlationId: randomUUID(),
    requestedAt: new Date().toISOString(),
    actor,
    objectKey,
    fileName,
    mimeType,
    sizeBytes,
  });

  if (response.type !== "file.upload-url-created") {
    throw commandFailureToAppError(response);
  }

  return {
    uploadUrl: response.uploadUrl,
    objectKey: response.objectKey,
    expiresInSeconds: response.expiresInSeconds,
  };
}

export async function getMediaDocumentMetadata(
  actor: MediaCommandActor,
  objectKey: string,
  fileName: string,
  mimeType: string,
  sizeBytes: number,
) {
  const response = await sendMediaCommand({
    type: "file.metadata-requested",
    correlationId: randomUUID(),
    requestedAt: new Date().toISOString(),
    actor,
    objectKey,
    fileName,
    mimeType,
    sizeBytes,
  });

  if (response.type !== "file.metadata-resolved") {
    throw commandFailureToAppError(response);
  }

  return {
    sizeBytes: response.sizeBytes,
    mimeType: response.mimeType,
  };
}

export async function deleteDocumentInMedia(actor: MediaCommandActor, objectKey: string) {
  const response = await sendMediaCommand({
    type: "file.delete-requested",
    correlationId: randomUUID(),
    requestedAt: new Date().toISOString(),
    actor,
    objectKey,
  });

  if (response.type !== "file.deleted") {
    throw commandFailureToAppError(response);
  }

  await db
    .delete(mediaAccessCache)
    .where(eq(mediaAccessCache.objectKey, objectKey));
}

async function sendMediaCommand(command: UnsignedMediaCommandRequest): Promise<MediaCommandResponse> {
  if (!mediaCircuitBreaker.checkCall()) {
    throw new AppError(503, "El circuito esta abierto: el servicio crm-media no esta disponible");
  }

  const store = traceStorage.getStore();
  if (store?.traceId) {
    command.traceId = store.traceId;
  }

  const signedCommand = signMediaCommand(command);
  const mediaBase = (env.MEDIA_SERVICE_URL || "http://crm-media:3002").replace(/\/$/, "");

  try {
    const res = await fetch(`${mediaBase}/api/v1/internal/documents/command`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(command.traceId ? { "x-trace-id": command.traceId } : {}),
      },
      body: JSON.stringify(signedCommand),
      signal: AbortSignal.timeout(env.MEDIA_COMMAND_TIMEOUT_MS),
    });

    const json = await res.json();
    const parsed = mediaResponseSchema.safeParse(json);
    if (!parsed.success) {
      mediaCircuitBreaker.recordFailure();
      throw new AppError(502, "Respuesta de media no cumple schema");
    }

    const response = parsed.data as MediaCommandResponse;
    if (response.type === "file.command-failed" && response.statusCode >= 500) {
      mediaCircuitBreaker.recordFailure();
    } else {
      mediaCircuitBreaker.recordSuccess();
    }

    return response;
  } catch (error) {
    mediaCircuitBreaker.recordFailure();
    if (error instanceof AppError) throw error;
    const message = error instanceof Error ? error.message : "Fallo de comunicación con crm-media";
    throw new AppError(503, message);
  }
}

function signMediaCommand(command: UnsignedMediaCommandRequest): MediaCommandRequest {
  const now = Math.floor(Date.now() / 1000);
  const jwtPayload = {
    iss: "crm-collab",
    aud: "crm-media",
    purpose: "media.command",
    correlationId: command.correlationId,
    commandType: command.type,
    objectKey: command.objectKey,
    iat: now,
    exp: now + 60,
  };
  const signature = signServiceJwt(jwtPayload);
  return { ...command, signature };
}

async function getCachedAccessUrl(objectKey: string, forceDownload: boolean) {
  const [row] = await db
    .select()
    .from(mediaAccessCache)
    .where(
      and(
        eq(mediaAccessCache.objectKey, objectKey),
        eq(mediaAccessCache.forceDownload, forceDownload),
        gt(mediaAccessCache.expiresAt, new Date(Date.now() + CACHE_SAFETY_WINDOW_MS)),
      ),
    )
    .limit(1);

  if (!row) return null;

  return {
    url: row.url,
    expiresInSeconds: Math.max(1, Math.floor((row.expiresAt.getTime() - Date.now()) / 1000)),
  };
}

async function cacheAccessUrl(
  objectKey: string,
  forceDownload: boolean,
  url: string,
  expiresInSeconds: number,
) {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + expiresInSeconds * 1000);

  await db
    .insert(mediaAccessCache)
    .values({ objectKey, forceDownload, url, expiresAt, updatedAt: now })
    .onConflictDoUpdate({
      target: [mediaAccessCache.objectKey, mediaAccessCache.forceDownload],
      set: {
        url: sql`excluded.url`,
        expiresAt: sql`excluded.expires_at`,
        updatedAt: now,
      },
    });
}

function commandFailureToAppError(response: MediaCommandResponse): AppError {
  if (response.type !== "file.command-failed") {
    return new AppError(502, "Respuesta inesperada de media");
  }
  return new AppError(response.statusCode, response.message);
}

