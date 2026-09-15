import type { Context } from "hono";
import type { AppEnv } from "../../../shared/middlewares/auth.middleware";
import { actorFromContext } from "../actor";
import { validatedJson } from "../validated-json";
import type { SignProjectContractBody, UpsertProjectContractBody } from "../collab.schemas";
import type { createContractService } from "./contract.service";

const requestMeta = (c: Context) => ({
  ipAddress: c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? c.req.header("x-real-ip")?.trim() ?? "unknown",
  userAgent: c.req.header("user-agent") ?? "unknown",
});
const projectId = (c: Context) => c.req.param("projectId") ?? "";

export const createContractController = (service: ReturnType<typeof createContractService>) => ({
  getContract: async (c: Context<AppEnv>) => c.json({ data: await service.getContract(actorFromContext(c), projectId(c)) }, 200),
  saveDraft: async (c: Context<AppEnv>) => c.json({ data: await service.saveDraft(actorFromContext(c), projectId(c), validatedJson<UpsertProjectContractBody>(c), requestMeta(c)) }, 200),
  requestSignature: async (c: Context<AppEnv>) => c.json({ data: await service.requestSignature(actorFromContext(c), projectId(c), requestMeta(c)) }, 200),
  sign: async (c: Context<AppEnv>) => c.json({ data: await service.sign(actorFromContext(c), projectId(c), validatedJson<SignProjectContractBody>(c), requestMeta(c)) }, 200),
});
