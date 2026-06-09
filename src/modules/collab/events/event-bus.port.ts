import type { CollabEvent, CollabEventType, CollabEventPayload } from "./event.types";

export type EventHandler = (event: CollabEvent<CollabEventPayload>) => void | Promise<void>;

export interface EventBus {
  on(eventType: CollabEventType, handler: EventHandler): void;
  onAny(handler: EventHandler): void;
  emit<T = CollabEventPayload>(
    eventType: CollabEventType,
    projectId: string,
    actorSub: string,
    data: T,
    tx?: any
  ): Promise<void>;
  off(eventType: CollabEventType, handler: EventHandler): void;
  clear(): void;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
}
