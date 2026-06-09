import { env } from "../../../config/env";
import { getRedisConnection, getRedisSubscriber } from "../../../shared/redis";
import { getLogger } from "../../../shared/logger";
import { InMemoryEventBus } from "./in-memory.event-bus";
import { RedisStreamsEventBus } from "./redis-streams.event-bus";
import type { EventBus } from "./event-bus.port";
import type { CollabEvent, CollabEventPayload } from "./event.types";

const logger = getLogger();

let activeBus: EventBus | null = null;

export function getEventBus(): EventBus {
  if (activeBus) return activeBus;

  if (env.REDIS_URL) {
    const pub = getRedisConnection();
    const sub = getRedisSubscriber();
    if (pub && sub) {
      activeBus = new RedisStreamsEventBus(pub, sub);
      return activeBus;
    }
  }

  activeBus = new InMemoryEventBus();
  return activeBus;
}

/**
 * Proxy singleton that delegates to the active EventBus implementation.
 * Existing consumers can keep importing `collabEvents` from this module
 * and will transparently use Redis Streams when REDIS_URL is present,
 * or fall back to the in-memory bus otherwise.
 */
export const collabEvents: EventBus = {
  on: (type, handler) => getEventBus().on(type, handler),
  onAny: (handler) => getEventBus().onAny(handler),
  emit: async (type, projectId, actorSub, data) =>
    getEventBus().emit(type, projectId, actorSub, data),
  off: (type, handler) => getEventBus().off(type, handler),
  clear: () => getEventBus().clear(),
  connect: () => getEventBus().connect(),
  disconnect: () => getEventBus().disconnect(),
};

export async function setupDefaultEventHandlers(): Promise<void> {
  const bus = getEventBus();
  bus.onAny(logAllEvents);
  await bus.connect();
}

async function logAllEvents(event: CollabEvent<CollabEventPayload>): Promise<void> {
  const timestampStr =
    event.timestamp instanceof Date
      ? event.timestamp.toISOString()
      : typeof event.timestamp === "string"
      ? new Date(event.timestamp).toISOString()
      : new Date().toISOString();

  logger.info(
    { type: event.type, projectId: event.projectId, actorSub: event.actorSub, timestamp: timestampStr },
    `Event ${event.type}`
  );
}

export type { CollabEvent, CollabEventType, CollabEventPayload } from "./event.types";
export type { EventBus } from "./event-bus.port";
