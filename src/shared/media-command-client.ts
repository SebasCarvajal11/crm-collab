import { randomUUID } from "crypto";
import { and, eq, gt, sql } from "drizzle-orm";
import { env } from "../config/env";
import { db } from "../db/connection";
import { mediaAccessCache } from "../db/schema";
import { createRedisStreamConsumerConnection, getRedisConnection } from "./redis";
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

const pendingResponses = new Map<string, PendingResponse>();
let responseLoopStarted = false;
let responseLoopRunning = false;
let responseLoopPromise: Promise<void> | null = null;
let responseRedis: NonNullable<ReturnType<typeof createRedisStreamConsumerConnection>> | undefined;
let responseLastId = "$";

const CACHE_SAFETY_WINDOW_MS = 15_000;

export async function startMediaResponseConsumer(): Promise<void> {
  if (responseLoopStarted) return;
  responseLoopStarted = true;

  const redis = createRedisStreamConsumerConnection();
  if (!redis) {
    logger.warn("[media-command-client] Redis no disponible; respuestas de media deshabilitadas");
    return;
  }

  responseRedis = redis;
  responseLoopRunning = true;
  responseLoopPromise = readMediaResponses(redis);
}

export async function stopMediaResponseConsumer(): Promise<void> {
  responseLoopRunning = false;
  const loopPromise = responseLoopPromise;
  responseRedis?.disconnect();
  responseRedis = undefined;
  responseLoopPromise = null;
  responseLoopStarted = false;

  if (loopPromise) {
    await Promise.race([
      loopPromise,
      new Promise<void>((resolve) => setTimeout(resolve, 3000)),
    ]);
  }

  for (const [correlationId, pending] of pendingResponses) {
    clearTimeout(pending.timer);
    pending.reject(new Error(`media response consumer stopped before ${correlationId}`));
  }
  pendingResponses.clear();
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

  const redis = getRedisConnection();
  if (!redis) {
    mediaCircuitBreaker.recordFailure();
    throw new AppError(503, "Redis no disponible para comandos de media");
  }

  await startMediaResponseConsumer();
  if (!responseLoopRunning) {
    mediaCircuitBreaker.recordFailure();
    throw new AppError(503, "Consumidor de respuestas de media no disponible");
  }

  const promise = new Promise<MediaCommandResponse>((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingResponses.delete(command.correlationId);
      reject(new AppError(504, "Tiempo de espera agotado esperando respuesta de media"));
    }, env.MEDIA_COMMAND_TIMEOUT_MS);

    pendingResponses.set(command.correlationId, { resolve, reject, timer });
  });

  const store = traceStorage.getStore();
  if (store?.traceId) {
    command.traceId = store.traceId;
  }

  const signedCommand = signMediaCommand(command);

  try {
    await redis.xadd(
      env.MEDIA_COMMANDS_STREAM_KEY,
      "*",
      "payload",
      JSON.stringify(signedCommand),
    );
    const res = await promise;

    if (res.type === "file.command-failed" && res.statusCode >= 500) {
      mediaCircuitBreaker.recordFailure();
    } else {
      mediaCircuitBreaker.recordSuccess();
    }

    return res;
  } catch (error) {
    mediaCircuitBreaker.recordFailure();

    const pending = pendingResponses.get(command.correlationId);
    if (pending) {
      clearTimeout(pending.timer);
      pendingResponses.delete(command.correlationId);
    }
    throw error;
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

async function readMediaResponses(redis: NonNullable<ReturnType<typeof createRedisStreamConsumerConnection>>) {
  while (responseLoopRunning) {
    try {
      const results = (await redis.xread(
        "COUNT",
        25,
        "BLOCK",
        5000,
        "STREAMS",
        env.MEDIA_RESPONSES_STREAM_KEY,
        responseLastId,
      )) as any[] | null;

      if (!results?.length) continue;

      for (const [, messages] of results) {
        for (const [messageId, fields] of messages ?? []) {
          responseLastId = messageId;
          const fieldMap = streamFieldsToMap(fields as string[]);
          if (fieldMap.get("__shutdown__") === "1") {
            continue;
          }

          const payload = fieldMap.get("payload");
          if (!payload) {
            continue;
          }

          let response: MediaCommandResponse | null = null;
          try {
            const raw = JSON.parse(payload);
            const result = mediaResponseSchema.safeParse(raw);
            if (result.success) {
              response = result.data as MediaCommandResponse;
            } else {
              logger.warn(
                { messageId, issues: result.error.issues },
                "[media-command-client] Respuesta de media no cumple schema",
              );
            }
          } catch {
            logger.warn({ messageId }, "[media-command-client] Respuesta invalida (JSON parse error)");
          }

          if (response?.correlationId) {
            const traceId = (response as any).traceId;
            const action = async () => {
              const pending = pendingResponses.get(response!.correlationId);
              if (pending) {
                clearTimeout(pending.timer);
                pendingResponses.delete(response!.correlationId);
                pending.resolve(response!);
              }
            };
            if (traceId) {
              await traceStorage.run({ traceId }, action);
            } else {
              await action();
            }
          }
        }
      }
    } catch (err) {
      if (!responseLoopRunning) break;
      logger.error({ err }, "[media-command-client] Error leyendo respuestas de media");
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
}

function streamFieldsToMap(fields: string[]): Map<string, string> {
  const map = new Map<string, string>();
  for (let i = 0; i < fields.length - 1; i += 2) {
    map.set(fields[i], fields[i + 1]);
  }
  return map;
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

