import { describe, expect, it } from "vitest";
import { pgConnectionConfig } from "./pg-config";

describe("pgConnectionConfig", () => {
  it("defines bounded connection-pool behavior", () => {
    expect(pgConnectionConfig.max).toBeGreaterThan(0);
    expect(pgConnectionConfig.idleTimeoutMillis).toBeGreaterThan(0);
    expect(pgConnectionConfig.connectionTimeoutMillis).toBeGreaterThan(0);
    expect(pgConnectionConfig.maxLifetimeSeconds).toBeGreaterThan(0);
  });
});
