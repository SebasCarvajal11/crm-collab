import { env } from "../../../config/env";

type RedisClient = {
  xadd: (...args: any[]) => Promise<string | null>;
  xrange: (...args: any[]) => Promise<[string, string[]][]>;
  xrevrange: (...args: any[]) => Promise<[string, string[]][]>;
  xdel: (...args: any[]) => Promise<number>;
};

export interface AuthEventDlqRecord {
  sourceStream: string;
  sourceGroup: string;
  sourceMessageId: string;
  consumerId: string;
  failedAt: string;
  deliveryCount: number;
  reason: string;
  errorName: string;
  errorMessage: string;
  errorStack?: string;
  payload?: string;
  rawFields: Record<string, string>;
}

export interface AuthEventDlqEntry extends AuthEventDlqRecord {
  id: string;
}

export async function appendAuthEventToDlq(
  redis: RedisClient,
  record: AuthEventDlqRecord,
): Promise<string> {
  const fields = [
    "sourceStream",
    record.sourceStream,
    "sourceGroup",
    record.sourceGroup,
    "sourceMessageId",
    record.sourceMessageId,
    "consumerId",
    record.consumerId,
    "failedAt",
    record.failedAt,
    "deliveryCount",
    String(record.deliveryCount),
    "reason",
    record.reason,
    "errorName",
    record.errorName,
    "errorMessage",
    record.errorMessage,
    "rawFields",
    JSON.stringify(record.rawFields),
  ];

  if (record.errorStack) {
    fields.push("errorStack", record.errorStack);
  }

  if (record.payload) {
    fields.push("payload", record.payload);
  }

  const dlqId = await redis.xadd(env.COLLAB_EVENTS_DLQ_STREAM_KEY, "*", ...fields);
  if (!dlqId) {
    throw new Error("Redis no devolvio id al escribir la entrada DLQ");
  }

  return dlqId;
}

export async function listAuthEventDlqEntries(
  redis: RedisClient,
  limit = 25,
): Promise<AuthEventDlqEntry[]> {
  const messages = await redis.xrevrange(
    env.COLLAB_EVENTS_DLQ_STREAM_KEY,
    "+",
    "-",
    "COUNT",
    limit,
  );

  return messages.map(([id, fields]) => parseDlqEntry(id, fields));
}

export async function replayAuthEventDlqEntry(
  redis: RedisClient,
  id: string,
  options: { removeAfterReplay?: boolean } = {},
): Promise<{ replayedMessageId: string; removed: boolean }> {
  const messages = await redis.xrange(env.COLLAB_EVENTS_DLQ_STREAM_KEY, id, id);
  if (!messages.length) {
    throw new Error(`No existe entrada DLQ con id ${id}`);
  }

  const entry = parseDlqEntry(messages[0][0], messages[0][1]);
  if (!entry.payload) {
    throw new Error(`La entrada DLQ ${id} no contiene payload reinyectable`);
  }

  const replayedMessageId = await redis.xadd(
    entry.sourceStream || env.AUTH_EVENTS_STREAM_KEY,
    "*",
    "payload",
    entry.payload,
  );
  if (!replayedMessageId) {
    throw new Error(`Redis no devolvio id al reinyectar la entrada DLQ ${id}`);
  }

  let removed = false;
  if (options.removeAfterReplay !== false) {
    removed = (await redis.xdel(env.COLLAB_EVENTS_DLQ_STREAM_KEY, id)) > 0;
  }

  return { replayedMessageId, removed };
}

export function streamFieldsToObject(fields: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (let i = 0; i < fields.length - 1; i += 2) {
    result[fields[i]] = fields[i + 1];
  }
  return result;
}

function parseDlqEntry(id: string, fields: string[]): AuthEventDlqEntry {
  const map = streamFieldsToObject(fields);
  let rawFields: Record<string, string> = {};

  try {
    rawFields = map.rawFields ? JSON.parse(map.rawFields) : {};
  } catch {
    rawFields = {};
  }

  return {
    id,
    sourceStream: map.sourceStream ?? env.AUTH_EVENTS_STREAM_KEY,
    sourceGroup: map.sourceGroup ?? env.AUTH_EVENTS_CONSUMER_GROUP,
    sourceMessageId: map.sourceMessageId ?? "",
    consumerId: map.consumerId ?? "",
    failedAt: map.failedAt ?? "",
    deliveryCount: Number(map.deliveryCount ?? 0),
    reason: map.reason ?? "unknown",
    errorName: map.errorName ?? "Error",
    errorMessage: map.errorMessage ?? "",
    errorStack: map.errorStack,
    payload: map.payload,
    rawFields,
  };
}
