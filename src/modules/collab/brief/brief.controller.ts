import type { Context } from "hono";
import type { AppEnv } from "../../../shared/middlewares/auth.middleware";
import { validatedJson } from "../validated-json";
import { actorFromContext } from "../actor";
import type { BriefPatchBody } from "../collab.schemas";
import type { createBriefService } from "./brief.service";

const getIp = (c: Context) =>
  c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ??
  c.req.header("x-real-ip")?.trim() ??
  "unknown";
const getUa = (c: Context) => c.req.header("user-agent") ?? "unknown";
const requiredParam = (c: Context, key: string) => c.req.param(key) ?? "";

export const createBriefController = (service: ReturnType<typeof createBriefService>) => ({
  getBrief: async (c: Context<AppEnv>) => {
    const brief = await service.getBrief(actorFromContext(c), requiredParam(c, "projectId"));
    return c.json({ data: brief }, 200);
  },

  patchBrief: async (c: Context<AppEnv>) => {
    const body = validatedJson<BriefPatchBody>(c);
    const brief = await service.patchBrief(actorFromContext(c), requiredParam(c, "projectId"), body.body, {
      ipAddress: getIp(c),
      userAgent: getUa(c),
    });
    return c.json({ data: brief }, 200);
  },
});
