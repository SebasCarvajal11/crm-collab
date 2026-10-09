import type { Context } from "hono";
import type { AppEnv } from "../../../shared/middlewares/auth.middleware";
import { validatedJson, validatedQuery } from "../validated-json";
import { actorFromContext } from "../actor";
import type {
  CreateMinorChangeRequestBody,
  CreateFormalChangeRequestBody,
  ResolveChangeRequestBody,
  FormalChangeLogQuery,
  ListChangeRequestsQuery,
} from "../collab.schemas";
import type { createChangeRequestService } from "./change-request.service";
import { getIp, getUa } from "../../../shared/request-context";

const requiredParam = (c: Context, key: string) => c.req.param(key) ?? "";

export const createChangeRequestController = (service: ReturnType<typeof createChangeRequestService>) => ({
  createMinorChangeRequest: async (c: Context<AppEnv>) => {
    const body = validatedJson<CreateMinorChangeRequestBody>(c);
    const row = await service.createMinorChangeRequest(
      actorFromContext(c),
      requiredParam(c, "projectId"),
      { taskId: body.task_id, title: body.title, description: body.description, priority: body.priority },
      { ipAddress: getIp(c), userAgent: getUa(c) }
    );
    return c.json({ data: row }, 201);
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
        priority: body.priority,
      },
      { ipAddress: getIp(c), userAgent: getUa(c) }
    );
    return c.json({ data: row }, 201);
  },

  resolveChangeRequest: async (c: Context<AppEnv>) => {
    const body = validatedJson<ResolveChangeRequestBody>(c);
    const inputStatus = body.status === "resolved" ? "accepted" : body.status;
    const row = await service.resolveChangeRequest(
      actorFromContext(c),
      requiredParam(c, "projectId"),
      requiredParam(c, "changeRequestId"),
      inputStatus as any,
      body.comment,
      { ipAddress: getIp(c), userAgent: getUa(c) }
    );
    return c.json({ data: row }, 200);
  },

  listChangeRequests: async (c: Context<AppEnv>) => {
    const q = validatedQuery<ListChangeRequestsQuery>(c);
    const status = q.status === "resolved" ? "accepted" : q.status;
    const rows = await service.listChangeRequests(actorFromContext(c), requiredParam(c, "projectId"), {
      type: q.type,
      status: status as any,
    });
    return c.json({ data: rows }, 200);
  },

  listFormalChangeLog: async (c: Context<AppEnv>) => {
    const q = validatedQuery<FormalChangeLogQuery>(c);
    const result = await service.listFormalChangeLog(actorFromContext(c), requiredParam(c, "projectId"), {
      page: q.page,
      limit: q.limit,
    });
    return c.json({ data: result }, 200);
  },

  listPendingChangeRequests: async (c: Context<AppEnv>) => {
    const rows = await service.listPendingChangeRequests(actorFromContext(c));
    return c.json({ data: rows }, 200);
  },
});
