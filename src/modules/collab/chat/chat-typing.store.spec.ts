import { describe, expect, it, beforeEach, vi } from "vitest";
import { chatTypingStore } from "./chat-typing.store";

describe("chatTypingStore", () => {
  beforeEach(() => {
    chatTypingStore.clear();
  });

  it("stores active typers and filters out the current user", () => {
    chatTypingStore.setTyping("proj-1", "external", "user-1", "Carlos Mendoza", 5000);
    chatTypingStore.setTyping("proj-1", "external", "user-2", "Ana Martínez", 5000);

    const forUser1 = chatTypingStore.getActiveTypers("proj-1", "external", "user-1");
    expect(forUser1).toEqual(["Ana Martínez"]);

    const forUser3 = chatTypingStore.getActiveTypers("proj-1", "external", "user-3");
    expect(forUser3).toEqual(["Carlos Mendoza", "Ana Martínez"]);
  });

  it("automatically expires typers after TTL", () => {
    vi.useFakeTimers();
    chatTypingStore.setTyping("proj-1", "external", "user-1", "Carlos Mendoza", 2000);

    expect(chatTypingStore.getActiveTypers("proj-1", "external")).toEqual(["Carlos Mendoza"]);

    vi.advanceTimersByTime(2500);

    expect(chatTypingStore.getActiveTypers("proj-1", "external")).toEqual([]);
    vi.useRealTimers();
  });
});
