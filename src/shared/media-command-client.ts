import { createHmac, randomUUID } from "crypto";
import { and, eq, gt, sql } from "drizzle-orm";
import { env } from "../config/env";
import { db } from "../db/connection";
import { mediaAccessCache } from "../db/schema";
import { getRedisConnection, getRedisSubscriber } from "./redis";
import { AppError } from "./middlewares/error-handler.middleware";
import { getLogger } from "./logger";

const logger = getLogger();

export type MediaCommandActor = {
  sub: string;
  userId: string;
  role: string;
  email: string;
};

type UnsignedMediaCommandRequest =
  | {
      type: "file.upload-url-requested";
      correlationId: string;
      requestedAt: string;
      actor: MediaCommandActor;
      objectKey: string;
      fileName: string;
      mimeType: string;
      sizeBytes: number;
    }
  | {
      type: "file.metadata-requested";
      correlationId: string;
      requestedAt: string;
      actor: MediaCommandActor;
      objectKey: string;
      fileName: string;
      mimeType: string;
      sizeBytes: number;
    }
  | {
      type: "file.access-requested";
      correlationId: string;
      requestedAt: string;
      actor: MediaCommandActor;
      objectKey: string;
      forceDownload: boolean;
    }
  | {
      type: "file.delete-requested";
      correlationId: string;
      requestedAt: string;
      actor: MediaCommandActor;
      objectKey: string;
    };

type MediaCommandRequest = UnsignedMediaCommandRequest & {
  signature: string;
};

type MediaCommandResponse =
  | {
      type: "file.upload-url-created";
      correlationId: string;
      objectKey: string;
      uploadUrl: string;
      expiresInSeconds: number;
    }
  | {
      type: "file.metadata-resolved";
      correlationId: string;
      objectKey: string;
      sizeBytes: number;
      mimeType: string;
    }
  | {
      type: "file.access-granted";
      correlationId: string;
      objectKey: string;
      url: string;
      expiresInSeconds: number;
    }
  | {
      type: "file.deleted";
      correlationId: string;
      objectKey: string;
    }
  | {
      type: "file.command-failed";
      correlationId: string;
      objectKey?: string;
      statusCode: number;
      message: string;
    };

type PendingResponse = {
  resolve: (response: MediaCommandResponse) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
};

const pendingResponses = new Map<string, PendingResponse>();
const responseConsumerId = `${env.HOSTNAME}-${process.pid}-${randomUUID()}`;
const responseConsumerGroup = `${env.MEDIA_RESPONSES_CONSUMER_GROUP}:${responseConsumerId}`;
let responseLoopStarted = false;
let responseLoopRunning = false;
let responseLoopPromise: Promise<void> | null = null;

const CACHE_SAFETY_WINDOW_MS = 15_000;

export async function startMediaResponseConsumer(): Promise<void> {
  if (responseLoopStarted) return;
  responseLoopStarted = true;

  const redis = getRedisSubscriber();
  if (!redis) {
    logger.warn("[media-command-client] Redis no disponible; respuestas de media deshabilitadas");
    return;
  }

  try {
    await redis.xgroup(
      "CREATE",
      env.MEDIA_RESPONSES_STREAM_KEY,
      responseConsumerGroup,
      "$",
      "MKSTREAM",
    );
  } catch (err: any) {
    if (!err.message?.includes("already exists")) {
      responseLoopStarted = false;
      throw err;
    }
  }

  responseLoopRunning = true;
  responseLoopPromise = readMediaResponses(redis);
}

export async function stopMediaResponseConsumer(): Promise<void> {
  responseLoopRunning = false;
  const redis = getRedisConnection();
  if (redis) {
    await redis
      .xadd(env.MEDIA_RESPONSES_STREAM_KEY, "*", "__shutdown__", "1")
      .catch(() => undefined);
  }

  if (responseLoopPromise) {
    await Promise.race([
      responseLoopPromise,
      new Promise<void>((resolve) => setTimeout(resolve, 3000)),
    ]);
  }

  if (redis) {
    await redis
      .xgroup("DESTROY", env.MEDIA_RESPONSES_STREAM_KEY, responseConsumerGroup)
      .catch(() => undefined);
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
  const redis = getRedisConnection();
  if (!redis) {
    throw new AppError(503, "Redis no disponible para comandos de media");
  }

  await startMediaResponseConsumer();
  if (!responseLoopRunning) {
    throw new AppError(503, "Consumidor de respuestas de media no disponible");
  }

  const promise = new Promise<MediaCommandResponse>((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingResponses.delete(command.correlationId);
      reject(new AppError(504, "Tiempo de espera agotado esperando respuesta de media"));
    }, env.MEDIA_COMMAND_TIMEOUT_MS);

    pendingResponses.set(command.correlationId, { resolve, reject, timer });
  });

  const signedCommand = signMediaCommand(command);

  try {
    await redis.xadd(
      env.MEDIA_COMMANDS_STREAM_KEY,
      "*",
      "payload",
      JSON.stringify(signedCommand),
    );
    return await promise;
  } catch (error) {
    const pending = pendingResponses.get(command.correlationId);
    if (pending) {
      clearTimeout(pending.timer);
      pendingResponses.delete(command.correlationId);
    }
    throw error;
  }
}

function signMediaCommand(command: UnsignedMediaCommandRequest): MediaCommandRequest {
  const signature = createHmac("sha256", env.GATEWAY_TRUST_SECRET)
    .update(mediaCommandSigningPayload(command))
    .digest("hex");
  return { ...command, signature };
}

function mediaCommandSigningPayload(command: UnsignedMediaCommandRequest): string {
  return JSON.stringify({
    type: command.type,
    correlationId: command.correlationId,
    requestedAt: command.requestedAt,
    objectKey: command.objectKey,
    forceDownload: command.type === "file.access-requested" ? command.forceDownload : undefined,
    fileName:
      command.type === "file.upload-url-requested" || command.type === "file.metadata-requested"
        ? command.fileName
        : undefined,
    mimeType:
      command.type === "file.upload-url-requested" || command.type === "file.metadata-requested"
        ? command.mimeType
        : undefined,
    sizeBytes:
      command.type === "file.upload-url-requested" || command.type === "file.metadata-requested"
        ? command.sizeBytes
        : undefined,
    actor: {
      sub: command.actor.sub,
      userId: command.actor.userId,
      role: command.actor.role,
      email: command.actor.email,
    },
  });
}

async function readMediaResponses(redis: NonNullable<ReturnType<typeof getRedisSubscriber>>) {
  while (responseLoopRunning) {
    try {
      const results = (await redis.xreadgroup(
        "GROUP",
        responseConsumerGroup,
        responseConsumerId,
        "COUNT",
        25,
        "BLOCK",
        5000,
        "STREAMS",
        env.MEDIA_RESPONSES_STREAM_KEY,
        ">",
      )) as any[] | null;

      if (!results?.length) continue;

      for (const [, messages] of results) {
        for (const [messageId, fields] of messages ?? []) {
          const fieldMap = streamFieldsToMap(fields as string[]);
          if (fieldMap.get("__shutdown__") === "1") {
            await redis.xack(env.MEDIA_RESPONSES_STREAM_KEY, responseConsumerGroup, messageId);
            continue;
          }

          const payload = fieldMap.get("payload");
          if (!payload) {
            await redis.xack(env.MEDIA_RESPONSES_STREAM_KEY, responseConsumerGroup, messageId);
            continue;
          }

          let response: MediaCommandResponse | null = null;
          try {
            response = JSON.parse(payload) as MediaCommandResponse;
          } catch {
            logger.warn({ messageId }, "[media-command-client] Respuesta invalida");
          }

          if (response?.correlationId) {
            const pending = pendingResponses.get(response.correlationId);
            if (pending) {
              clearTimeout(pending.timer);
              pendingResponses.delete(response.correlationId);
              pending.resolve(response);
            }
          }

          await redis.xack(env.MEDIA_RESPONSES_STREAM_KEY, responseConsumerGroup, messageId);
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
