import type { Context } from "hono";
import type { AppEnv } from "../../../shared/middlewares/auth.middleware";
import { validatedJson, validatedQuery } from "../validated-json";
import { actorFromContext } from "../actor";
import type {
  CreateMinorChangeRequestBody,
  CreateFormalChangeRequestBody,
  ResolveChangeRequestBody,
  FormalChangeLogQuery,
} from "../collab.schemas";
import type { createChangeRequestService } from "./change-request.service";

const getIp = (c: Context) =>
  c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ??
  c.req.header("x-real-ip")?.trim() ??
  "unknown";
const getUa = (c: Context) => c.req.header("user-agent") ?? "unknown";
const requiredParam = (c: Context, key: string) => c.req.param(key) ?? "";

const mapChangeRequest = (req: any) => {
  if (!req) return req;
  return {
    ...req,
    status: req.status === "accepted" ? "resolved" : req.status,
  };
};

const mapChangeRequestsPage = (result: any) => {
  if (!result || !Array.isArray(result.items)) return result;
  return {
    ...result,
    items: result.items.map(mapChangeRequest),
  };
};

export const createChangeRequestController = (service: ReturnType<typeof createChangeRequestService>) => ({
  createMinorChangeRequest: async (c: Context<AppEnv>) => {
    const body = validatedJson<CreateMinorChangeRequestBody>(c);
    const row = await service.createMinorChangeRequest(
      actorFromContext(c),
      requiredParam(c, "projectId"),
      { taskId: body.task_id, title: body.title, description: body.description },
      { ipAddress: getIp(c), userAgent: getUa(c) }
    );
    return c.json({ data: mapChangeRequest(row) }, 201);
  },

  createFormalChangeRequest: async (c: Context<AppEnv>) => {
    const body = validatedJson<CreateFormalChangeRequestBody>(c);
    const row = await service.createFormalChangeRequest(
      actorFromContext(c),
      requiredParam(c, "projectId"),
      {
        taskId: body.task_id,
        title: body.title,
        description: body.description,
        justification: body.justification,
      },
      { ipAddress: getIp(c), userAgent: getUa(c) }
    );
    return c.json({ data: mapChangeRequest(row) }, 201);
  },

  resolveChangeRequest: async (c: Context<AppEnv>) => {
    const body = validatedJson<ResolveChangeRequestBody>(c);
    const inputStatus = body.status === "resolved" ? "accepted" : body.status;
    const row = await service.resolveChangeRequest(
      actorFromContext(c),
      requiredParam(c, "projectId"),
      requiredParam(c, "changeRequestId"),
      inputStatus as any,
      { ipAddress: getIp(c), userAgent: getUa(c) }
    );
    return c.json({ data: mapChangeRequest(row) }, 200);
  },

  listFormalChangeLog: async (c: Context<AppEnv>) => {
    const q = validatedQuery<FormalChangeLogQuery>(c);
    const result = await service.listFormalChangeLog(actorFromContext(c), requiredParam(c, "projectId"), {
      page: q.page,
      limit: q.limit,
    });
    return c.json({ data: mapChangeRequestsPage(result) }, 200);
  },
});
