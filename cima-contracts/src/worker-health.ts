import fs from "fs";
import path from "path";
import { checkPostgres, checkRedis } from "./health";
import { getLogger } from "./logger";

const logger = getLogger();

export interface WorkerHealthOptions {
  pool?: { connect(): Promise<{ query(sql: string): Promise<unknown>; release(): void }> };
  redis?: { ping(): Promise<string> };
  intervalMs?: number;
}

export function startWorkerHealthcheck(workerName: string, options: WorkerHealthOptions = {}) {
  const { pool, redis, intervalMs = 15000 } = options;
  const filePath = "/tmp/worker-healthy";

  // Ensure /tmp directory exists
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
  } catch {
    // Ignore
  }

  const runCheck = async () => {
    const dependencies = [];
    if (pool) {
      dependencies.push(await checkPostgres(pool));
    }
    if (redis) {
      dependencies.push(await checkRedis(redis));
    }

    const hasFailure = dependencies.some((d) => d.status !== "ok");
    const status = hasFailure ? "down" : "ok";

    const report = {
      status,
      worker: workerName,
      timestamp: new Date().toISOString(),
      dependencies,
    };

    try {
      fs.writeFileSync(filePath, JSON.stringify(report, null, 2), "utf8");
    } catch (err) {
      logger.error({ err, worker: workerName }, "Error writing worker health file");
    }
  };

  // Run immediately and then on interval
  void runCheck();
  const timer = setInterval(() => {
    void runCheck();
  }, intervalMs);

  return {
    stop: () => {
      clearInterval(timer);
      try {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      } catch {
        // Ignore
      }
    }
  };
}
