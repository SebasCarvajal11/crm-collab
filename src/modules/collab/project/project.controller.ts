import type { Context } from "hono";
import type { AppEnv } from "../../../shared/middlewares/auth.middleware";
import { validatedJson, validatedQuery } from "../validated-json";
import { actorFromContext } from "../actor";
import type {
  ProjectFiltersQuery,
  ProjectSearchQuery,
  CreateProjectBody,
  UpdateProjectBody,
} from "../collab.schemas";
import type { createProjectService } from "./project.service";

const getIp = (c: Context) =>
  c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ??
  c.req.header("x-real-ip")?.trim() ??
  "unknown";
const getUa = (c: Context) => c.req.header("user-agent") ?? "unknown";
const requiredParam = (c: Context, key: string) => c.req.param(key) ?? "";

export const createProjectController = (service: ReturnType<typeof createProjectService>) => ({
  listProjects: async (c: Context<AppEnv>) => {
    const q = validatedQuery<ProjectFiltersQuery>(c);
    const rows = await service.listProjects(actorFromContext(c), {
      page: q.page,
      limit: q.limit,
      type: q.type,
      status: q.status,
      adminSub: q.admin_sub,
      clientName: q.client_name,
    });
    return c.json({ data: rows }, 200);
  },

  searchProjects: async (c: Context<AppEnv>) => {
    const q = validatedQuery<ProjectSearchQuery>(c);
    const rows = await service.searchProjects(actorFromContext(c), { q: q.q, limit: q.limit });
    return c.json({ data: rows }, 200);
  },

  createProject: async (c: Context<AppEnv>) => {
    const body = validatedJson<CreateProjectBody>(c);
    const created = await service.createProject(
      actorFromContext(c),
      {
        name: body.name,
        description: body.description,
        clientName: body.client_name,
        clientSub: body.client_sub,
        workerSubs: body.worker_subs,
        type: body.type,
        estimatedDueDate: body.estimated_due_date,
        brief: body.brief,
      },
      { ipAddress: getIp(c), userAgent: getUa(c) }
    );
    return c.json({ data: created }, 201);
  },

  updateProject: async (c: Context<AppEnv>) => {
    const body = validatedJson<UpdateProjectBody>(c);
    const row = await service.updateProject(
      actorFromContext(c),
      requiredParam(c, "projectId"),
      {
        name: body.name,
        description: body.description,
        status: body.status,
        estimatedDueDate: body.estimated_due_date,
        progressPercent: body.progress_percent,
      },
      { ipAddress: getIp(c), userAgent: getUa(c) }
    );
    return c.json({ data: row }, 200);
  },

  getProjectWorkspace: async (c: Context<AppEnv>) => {
    const data = await service.getProjectWorkspace(actorFromContext(c), requiredParam(c, "projectId"));
    return c.json({ data }, 200);
  },

  getProjectBoard: async (c: Context<AppEnv>) => {
    const data = await service.getProjectBoard(actorFromContext(c), requiredParam(c, "projectId"));
    return c.json({ data }, 200);
  },

  listProjectTimeline: async (c: Context<AppEnv>) => {
    const query = validatedQuery<{ page: number; limit: number }>(c);
    const result = await service.listProjectTimeline(
      actorFromContext(c),
      requiredParam(c, "projectId"),
      query
    );
    return c.json({ data: result.items }, 200);
  },

  listFilesTimeline: async (c: Context<AppEnv>) => {
    const query = validatedQuery<{ page: number; limit: number }>(c);
    const result = await service.listProjectTimeline(
      actorFromContext(c),
      requiredParam(c, "projectId"),
      query
    );
    return c.json({ data: result.items }, 200);
  },
});
