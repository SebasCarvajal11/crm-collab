import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { pgConnectionConfig } from "./pg-config";
import * as schema from "./schema";
import { getLogger } from "../shared/logger";

export const pool = new Pool(pgConnectionConfig);
pool.on("error", (err) => {
  getLogger().error({ err }, "[postgres] error inesperado en conexión inactiva del pool");
});
export const db = drizzle(pool, { schema });
