import type { Context } from "hono";
import type { AppEnv } from "../../../shared/middlewares/auth.middleware";
import { actorFromContext } from "../actor";
import { db } from "../../../db/connection";
import { createAdminStorageRepository } from "./admin-storage.repository";
import { createAdminStorageService } from "./admin-storage.service";
import type { PurgeBatchInput } from "./admin-storage.types";

const getIp = (c: Context) =>
  c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ??
  c.req.header("x-real-ip")?.trim() ??
  "unknown";
const getUa = (c: Context) => c.req.header("user-agent") ?? "unknown";

const repo = createAdminStorageRepository(db);
const service = createAdminStorageService(repo);

export const adminStorageController = {
  getStorageTree: async (c: Context<AppEnv>) => {
    try {
      const data = await service.getStorageTree();
      return c.json({ data }, 200);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return c.json({ error: msg }, 500);
    }
  },

  purgeFile: async (c: Context<AppEnv>) => {
    const actor = actorFromContext(c);
    const fileId = c.req.param("fileId") ?? "";
    const ipAddress = getIp(c);
    const userAgent = getUa(c);

    let body: { reason?: string; forcePurgeSigned?: boolean } = {};
    try {
      body = await c.req.json();
    } catch {
      // Body opcional
    }

    const data = await service.purgeSingleFile(
      actor,
      fileId,
      body.reason || "Depurado por administración",
      Boolean(body.forcePurgeSigned),
      { ipAddress, userAgent }
    );

    return c.json({ data }, 200);
  },

  purgeBatch: async (c: Context<AppEnv>) => {
    const actor = actorFromContext(c);
    const ipAddress = getIp(c);
    const userAgent = getUa(c);

    let body: PurgeBatchInput = {};
    try {
      body = await c.req.json();
    } catch {
      // Body vacío
    }

    const data = await service.purgeBatch(actor, body, { ipAddress, userAgent });
    return c.json({ data }, 200);
  },
};
