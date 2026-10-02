import type { Context } from "hono";
import type { AppEnv } from "../../../shared/middlewares/auth.middleware";
import { validatedJson } from "../validated-json";
import { actorFromContext } from "../actor";
import type { UpsertProjectMemberBody } from "../collab.schemas";
import type { createMemberService } from "./member.service";

import { getIp, getUa } from "../../../shared/request-context";
const requiredParam = (c: Context, key: string) => c.req.param(key) ?? "";

export const createMemberController = (service: ReturnType<typeof createMemberService>) => ({
  upsertProjectMember: async (c: Context<AppEnv>) => {
    const body = validatedJson<UpsertProjectMemberBody>(c);
    const row = await service.upsertProjectMember(
      actorFromContext(c),
      requiredParam(c, "projectId"),
      body.user_sub,
      body.role,
      body.user_email,
      { ipAddress: getIp(c), userAgent: getUa(c) }
    );
    return c.json({ data: row }, 200);
  },

  listProjectMembers: async (c: Context<AppEnv>) => {
    const rows = await service.listProjectMembers(actorFromContext(c), requiredParam(c, "projectId"));
    return c.json({ data: rows }, 200);
  },
});
