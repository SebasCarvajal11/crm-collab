import { getLogger } from "./logger";

const logger = getLogger();

export class SimpleCircuitBreaker {
  private state: "CLOSED" | "OPEN" | "HALF_OPEN" = "CLOSED";
  private failures: number[] = [];
  private successes: number[] = [];
  private lastStateChange: number = Date.now();

  constructor(
    private thresholdRate = 0.5,
    private windowMs = 60000,
    private cooldownMs = 10000,
    private minRequests = 5,
  ) {}

  public getState() {
    return this.state;
  }

  public getCooldownMs() {
    return this.cooldownMs;
  }

  public checkCall(): boolean {
    const now = Date.now();
    this.cleanOldMetrics(now);

    if (this.state === "OPEN") {
      if (now - this.lastStateChange >= this.cooldownMs) {
        this.transitionTo("HALF_OPEN", now);
        return true;
      }
      return false;
    }
    return true;
  }

  public recordSuccess(): void {
    const now = Date.now();
    if (this.state === "HALF_OPEN") {
      this.transitionTo("CLOSED", now);
      this.failures = [];
      this.successes = [];
    } else if (this.state === "CLOSED") {
      this.successes.push(now);
    }
  }

  public recordFailure(): void {
    const now = Date.now();
    if (this.state === "HALF_OPEN" || this.state === "CLOSED") {
      this.failures.push(now);
      this.checkFailureRate(now);
    }
  }

  private transitionTo(newState: "CLOSED" | "OPEN" | "HALF_OPEN", now: number) {
    logger.warn({ from: this.state, to: newState, topic: "circuit-breaker" }, `Circuit breaker state transition`);
    this.state = newState;
    this.lastStateChange = now;
  }

  private cleanOldMetrics(now: number) {
    const limit = now - this.windowMs;
    this.failures = this.failures.filter((t) => t > limit);
    this.successes = this.successes.filter((t) => t > limit);
  }

  private checkFailureRate(now: number) {
    this.cleanOldMetrics(now);
    const total = this.failures.length + this.successes.length;
    if (this.state === "HALF_OPEN") {
      this.transitionTo("OPEN", now);
    } else if (this.state === "CLOSED" && total >= this.minRequests) {
      const rate = this.failures.length / total;
      if (rate >= this.thresholdRate) {
        this.transitionTo("OPEN", now);
      }
    }
  }
}

export const mediaCircuitBreaker = new SimpleCircuitBreaker();
