import type { CollabEvent, CollabEventType, CollabEventPayload } from "./event.types";

export type EventHandler = (event: CollabEvent<CollabEventPayload>) => void | Promise<void>;

export class EventEmitter {
  private handlers: Map<CollabEventType, EventHandler[]> = new Map();
  private globalHandlers: EventHandler[] = [];

  on(eventType: CollabEventType, handler: EventHandler): void {
    const existing = this.handlers.get(eventType) || [];
    this.handlers.set(eventType, [...existing, handler]);
  }

  onAny(handler: EventHandler): void {
    this.globalHandlers.push(handler);
  }

  async emit<T = CollabEventPayload>(eventType: CollabEventType, projectId: string, actorSub: string, data: T): Promise<void> {
    const event: CollabEvent<T> = {
      type: eventType,
      projectId,
      actorSub,
      timestamp: new Date(),
      data,
    };

    const specificHandlers = this.handlers.get(eventType) || [];
    const allHandlers = [...specificHandlers, ...this.globalHandlers];

    await Promise.allSettled(
      allHandlers.map((handler) =>
        Promise.resolve(handler(event as CollabEvent<CollabEventPayload>))
          .catch((err) => {
            console.error(`[EventEmitter] Error in handler for ${eventType}:`, err);
          })
      )
    );
  }

  off(eventType: CollabEventType, handler: EventHandler): void {
    const existing = this.handlers.get(eventType);
    if (existing) {
      this.handlers.set(
        eventType,
        existing.filter((h) => h !== handler)
      );
    }
  }

  clear(): void {
    this.handlers.clear();
    this.globalHandlers = [];
  }
}

export const collabEvents = new EventEmitter();
