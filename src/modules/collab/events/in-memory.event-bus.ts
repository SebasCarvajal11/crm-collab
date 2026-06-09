import type { CollabEvent, CollabEventType, CollabEventPayload } from "./event.types";
import type { EventBus, EventHandler } from "./event-bus.port";
import { COLLAB_EVENT_CONTRACT_VERSION } from "@sebascarvajal11/cima-contracts/collab-project-events";
import { getLogger } from "../../../shared/logger";

const logger = getLogger();

export class InMemoryEventBus implements EventBus {
  private handlers: Map<CollabEventType, EventHandler[]> = new Map();
  private globalHandlers: EventHandler[] = [];
  private connected = false;

  on(eventType: CollabEventType, handler: EventHandler): void {
    const existing = this.handlers.get(eventType) || [];
    this.handlers.set(eventType, [...existing, handler]);
  }

  onAny(handler: EventHandler): void {
    this.globalHandlers.push(handler);
  }

  async emit<T = CollabEventPayload>(
    eventType: CollabEventType,
    projectId: string,
    actorSub: string,
    data: T,
    tx?: any
  ): Promise<void> {
    const event: CollabEvent<T> = {
      version: 1,
      contractVersion: COLLAB_EVENT_CONTRACT_VERSION,
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
        Promise.resolve(handler(event as CollabEvent<CollabEventPayload>)).catch((err) => {
          logger.error({ err, eventType }, `[InMemoryEventBus] Error in handler for ${eventType}`);
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

  async connect(): Promise<void> {
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    this.clear();
  }
}
