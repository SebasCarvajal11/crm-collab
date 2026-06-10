export type DependencyStatus = "ok" | "down" | "timeout";

export type HealthDependency = {
  status: DependencyStatus;
  latencyMs?: number;
  error?: string;
};

export type HealthResponse = {
  status: "ok" | "degraded" | "down";
  version: string;
  uptimeSec: number;
  dependencies: {
    [name: string]: HealthDependency;
  };
};

export function buildHealthResponse(
  version: string,
  startTime: number,
  dependencies: Record<string, HealthDependency>
): { body: HealthResponse; status: 200 | 503 } {
  const values = Object.values(dependencies);
  const hasCriticalFailure = values.some((d) => d.status === "down");
  const hasDegraded = values.some((d) => d.status === "timeout");

  let status: "ok" | "degraded" | "down" = "ok";
  if (hasCriticalFailure) {
    status = "down";
  } else if (hasDegraded) {
    status = "degraded";
  }

  return {
    status: status === "down" ? 503 : 200,
    body: {
      status,
      version,
      uptimeSec: Math.floor((Date.now() - startTime) / 1000),
      dependencies,
    },
  };
}

// ── Dependency Checkers ─────────────────────────────────────────────────────

export async function checkPostgres(pool: {
  connect(): Promise<{ query(sql: string): Promise<unknown>; release(): void }>;
}): Promise<HealthDependency> {
  const start = Date.now();
  let client: { query(sql: string): Promise<unknown>; release(): void } | undefined;
  try {
    client = await pool.connect();
    await client.query("SELECT 1");
    return { status: "ok", latencyMs: Date.now() - start };
  } catch (error) {
    return {
      status: "down",
      latencyMs: Date.now() - start,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  } finally {
    client?.release();
  }
}

export async function checkRedis(redis: { ping(): Promise<string> } | undefined): Promise<HealthDependency> {
  if (!redis) return { status: "ok" };
  const start = Date.now();
  try {
    const pong = await redis.ping();
    if (pong === "PONG") {
      return { status: "ok", latencyMs: Date.now() - start };
    }
    return { status: "down", latencyMs: Date.now() - start, error: `Unexpected: ${pong}` };
  } catch (error) {
    return {
      status: "down",
      latencyMs: Date.now() - start,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
