import { describe, it, expect, beforeEach, vi } from "vitest";
import { SimpleCircuitBreaker } from "./media-command-client";

describe("SimpleCircuitBreaker", () => {
  let cb: SimpleCircuitBreaker;

  beforeEach(() => {
    // Instantiate with custom parameters for easier unit testing:
    // thresholdRate: 50%, windowMs: 1000ms, cooldownMs: 100ms, minRequests: 4
    cb = new SimpleCircuitBreaker(0.5, 1000, 100, 4);
    vi.useFakeTimers();
  });

  it("should initialize in CLOSED state and allow calls", () => {
    expect(cb.getState()).toBe("CLOSED");
    expect(cb.checkCall()).toBe(true);
  });

  it("should stay CLOSED if failure rate is below threshold", () => {
    cb.recordFailure();
    cb.recordSuccess();
    cb.recordSuccess();
    cb.recordSuccess(); // 1 failure, 3 successes = 25% failure rate

    expect(cb.getState()).toBe("CLOSED");
    expect(cb.checkCall()).toBe(true);
  });

  it("should stay CLOSED if total requests are below minRequests", () => {
    cb.recordFailure();
    cb.recordFailure();
    cb.recordFailure(); // 3 failures, 0 successes. Rate is 100% but total is 3 < 4.

    expect(cb.getState()).toBe("CLOSED");
    expect(cb.checkCall()).toBe(true);
  });

  it("should trip to OPEN if failure rate crosses threshold", () => {
    cb.recordFailure();
    cb.recordFailure();
    cb.recordSuccess();
    cb.recordFailure(); // 3 failures, 1 success = 75% rate (total 4)

    expect(cb.getState()).toBe("OPEN");
    expect(cb.checkCall()).toBe(false);
  });

  it("should transition to HALF_OPEN after cooldown period", () => {
    cb.recordFailure();
    cb.recordFailure();
    cb.recordFailure();
    cb.recordFailure(); // Trip to OPEN

    expect(cb.getState()).toBe("OPEN");
    expect(cb.checkCall()).toBe(false);

    // Advance time past cooldown (100ms)
    vi.advanceTimersByTime(150);

    expect(cb.checkCall()).toBe(true); // Should allow the call and transition
    expect(cb.getState()).toBe("HALF_OPEN");
  });

  it("should transition from HALF_OPEN back to CLOSED on success call", () => {
    cb.recordFailure();
    cb.recordFailure();
    cb.recordFailure();
    cb.recordFailure(); // Trip to OPEN

    vi.advanceTimersByTime(150);
    cb.checkCall(); // Transition to HALF_OPEN

    cb.recordSuccess(); // Test request succeeds

    expect(cb.getState()).toBe("CLOSED");
    expect(cb.checkCall()).toBe(true);
  });

  it("should transition from HALF_OPEN back to OPEN on failure call", () => {
    cb.recordFailure();
    cb.recordFailure();
    cb.recordFailure();
    cb.recordFailure(); // Trip to OPEN

    vi.advanceTimersByTime(150);
    cb.checkCall(); // Transition to HALF_OPEN

    cb.recordFailure(); // Test request fails

    expect(cb.getState()).toBe("OPEN");
    expect(cb.checkCall()).toBe(false);
  });
});
