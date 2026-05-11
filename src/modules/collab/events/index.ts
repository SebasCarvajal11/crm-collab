import { collabEvents } from "./event-emitter";
import type { CollabEvent, CollabEventPayload } from "./event.types";

export function setupDefaultEventHandlers() {
  collabEvents.onAny(logAllEvents);
}

async function logAllEvents(event: CollabEvent<CollabEventPayload>): Promise<void> {
  console.log(
    `[Event] ${event.type} | Project: ${event.projectId} | Actor: ${event.actorSub} | ` +
    `Timestamp: ${event.timestamp.toISOString()}`
  );
}

export { collabEvents } from "./event-emitter";
export type { CollabEvent, CollabEventType, CollabEventPayload } from "./event.types";
