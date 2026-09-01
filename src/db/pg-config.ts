import type { PoolConfig } from "pg";
import { env } from "../config/env";

export const pgConnectionConfig: PoolConfig = {
  connectionString: env.DATABASE_URL,
  options: `-c search_path=${env.DB_SCHEMA}`,
  application_name: env.SERVICE_NAME ?? "crm-collab",
  max: env.DB_POOL_MAX,
  idleTimeoutMillis: env.DB_POOL_IDLE_TIMEOUT_MS,
  connectionTimeoutMillis: env.DB_POOL_CONNECTION_TIMEOUT_MS,
  maxLifetimeSeconds: env.DB_POOL_MAX_LIFETIME_SECONDS,
};
