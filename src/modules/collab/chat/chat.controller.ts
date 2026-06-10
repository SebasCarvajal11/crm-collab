import type { Context } from "hono";
import type { AppEnv } from "../../../shared/middlewares/auth.middleware";
import { validatedJson, validatedQuery } from "../validated-json";
import { actorFromContext } from "../actor";
import type {
  ChatMessageQuery,
  CreateChatMessageBody,
  MarkChatReadBody,
} from "../collab.schemas";
import type { createChatService } from "./chat.service";

const getIp = (c: Context) =>
  c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ??
  c.req.header("x-real-ip")?.trim() ??
  "unknown";
const getUa = (c: Context) => c.req.header("user-agent") ?? "unknown";
const requiredParam = (c: Context, key: string) => c.req.param(key) ?? "";

const mapMessage = (msg: any) => {
  if (!msg) return msg;
  return {
    ...msg,
    content: msg.body,
  };
};

const mapMessagesPage = (result: any) => {
  if (!result || !Array.isArray(result.items)) return result;
  return {
    ...result,
    items: result.items.map(mapMessage),
  };
};

export const createChatController = (service: ReturnType<typeof createChatService>) => ({
  listInternalChat: async (c: Context<AppEnv>) => {
    const q = validatedQuery<ChatMessageQuery>(c);
    const result = await service.listChatMessages(actorFromContext(c), requiredParam(c, "projectId"), "internal", {
      page: q.page,
      limit: q.limit,
    });
    return c.json({ data: mapMessagesPage(result) }, 200);
  },

  postInternalChat: async (c: Context<AppEnv>) => {
    const body = validatedJson<CreateChatMessageBody>(c);
    const row = await service.postChatMessage(
      actorFromContext(c),
      requiredParam(c, "projectId"),
      "internal",
      body.body,
      body.mentions,
      { ipAddress: getIp(c), userAgent: getUa(c) }
    );
    return c.json({ data: mapMessage(row) }, 201);
  },

  markInternalChatRead: async (c: Context<AppEnv>) => {
    const body = validatedJson<MarkChatReadBody>(c);
    const row = await service.markChatAsRead(
      actorFromContext(c),
      requiredParam(c, "projectId"),
      "internal",
      { upToMessageId: body.up_to_message_id, messageIds: body.message_ids ?? [] }
    );
    return c.json({ data: row }, 200);
  },

  listExternalChat: async (c: Context<AppEnv>) => {
    const q = validatedQuery<ChatMessageQuery>(c);
    const result = await service.listChatMessages(actorFromContext(c), requiredParam(c, "projectId"), "external", {
      page: q.page,
      limit: q.limit,
    });
    return c.json({ data: mapMessagesPage(result) }, 200);
  },

  postExternalChat: async (c: Context<AppEnv>) => {
    const body = validatedJson<CreateChatMessageBody>(c);
    const row = await service.postChatMessage(
      actorFromContext(c),
      requiredParam(c, "projectId"),
      "external",
      body.body,
      body.mentions,
      { ipAddress: getIp(c), userAgent: getUa(c) }
    );
    return c.json({ data: mapMessage(row) }, 201);
  },

  markExternalChatRead: async (c: Context<AppEnv>) => {
    const body = validatedJson<MarkChatReadBody>(c);
    const row = await service.markChatAsRead(
      actorFromContext(c),
      requiredParam(c, "projectId"),
      "external",
      { upToMessageId: body.up_to_message_id, messageIds: body.message_ids ?? [] }
    );
    return c.json({ data: row }, 200);
  },
});
