import { BadRequestError, ForbiddenError } from "../../../shared/middlewares/error-handler.middleware";
import { collabEvents } from "../events";
import { canInternalChat, canReceiveMentionInChannel } from "../shared/guards";
import { allowedMentionRolesByActor } from "../shared/mappers";
import { assertProjectAccess } from "../shared/project-access";
import { createAuditRepository } from "../repository/audit.repository";
import type { GlobalRole } from "../collab.types";
import { createChatRepository } from "./chat.repository";
import { createProjectRepository } from "../project/project.repository";
import { createMemberRepository } from "../member/member.repository";
import { createNotificationRepository } from "../notification/notification.repository";
import { db } from "../../../db/connection";
import { getUserProfilesFromSnapshots } from "../../../shared/identity-snapshot-store";

type Actor = {
  sub: string;
  userId: string;
  role: GlobalRole;
  email: string;
  bearerToken?: string;
};
type RequestMeta = { ipAddress: string; userAgent: string };

export const createChatService = (
  chatRepository: ReturnType<typeof createChatRepository>,
  projectRepository: ReturnType<typeof createProjectRepository>,
  memberRepository: ReturnType<typeof createMemberRepository>,
  notificationRepository: ReturnType<typeof createNotificationRepository>
) => {
  const accessRepo = {
    findProjectById: projectRepository.findProjectById,
    findProjectMember: memberRepository.findProjectMember,
    listProjectMembers: memberRepository.listProjectMembers,
  };

  return {
    listChatMessages: async (
      actor: Actor,
      projectId: string,
      channel: "internal" | "external",
      query: { page: number; limit: number }
    ) => {
      const { member } = await assertProjectAccess(accessRepo, actor, projectId);
      if (channel === "internal" && !canInternalChat(actor.role, member?.role)) {
        throw new ForbiddenError("No tienes acceso al chat interno");
      }
      const { rows: messages, total } = await chatRepository.listChatMessagesByChannel({
        projectId,
        channel,
        limit: query.limit,
        offset: (query.page - 1) * query.limit,
      });

      const members = await memberRepository.listProjectMembers(projectId);
      const reads = await chatRepository.listChatReadsByMessages(messages.map((m) => m.id));
      const readersByMessage = new Map<string, Set<string>>();
      for (const read of reads) {
        if (!readersByMessage.has(read.messageId)) readersByMessage.set(read.messageId, new Set());
        readersByMessage.get(read.messageId)!.add(read.userSub);
      }
      const memberSubs = new Set(members.map((m) => m.userSub));
      const memberBySub = new Map(members.map((m) => [m.userSub, m]));
      const visibleRecipients = channel === "internal"
        ? members.filter((candidate) => candidate.role !== "client")
        : members;

      const authorSubs = [...new Set(messages.map((m) => m.authorSub).filter((sub): sub is string => Boolean(sub)))];
      const { profiles } = authorSubs.length > 0
        ? await getUserProfilesFromSnapshots(authorSubs)
        : { profiles: new Map() };

      const items = messages.map((msg) => {
        const readers = readersByMessage.get(msg.id) ?? new Set<string>();
        const mentioned = ((msg.mentionedSubs ?? []) as string[]).filter((sub) => memberSubs.has(sub));
        const authorMember = msg.authorSub ? memberBySub.get(msg.authorSub) : undefined;
        const required =
          mentioned.length > 0
            ? mentioned.filter((sub) => sub !== msg.authorSub)
            : visibleRecipients.map((m) => m.userSub).filter((sub) => sub !== msg.authorSub);
        const seenCount = required.filter((sub) => readers.has(sub)).length;
        const isSeen = required.length === 0 ? true : seenCount === required.length;
        const profile = msg.authorSub ? profiles.get(msg.authorSub) : undefined;
        return {
          ...msg,
          authorFirstName: profile?.firstName ?? null,
          authorLastName: profile?.lastName ?? null,
          authorRole: authorMember?.role ?? profile?.role ?? null,
          authorProfession: profile?.profession ?? null,
          readStatus: {
            isSeen,
            requiredCount: required.length,
            seenCount,
          },
        };
      });

      const totalPages = total === 0 ? 0 : Math.ceil(total / query.limit);
      return { items, page: query.page, limit: query.limit, total, total_pages: totalPages };
    },

    postChatMessage: async (
      actor: Actor,
      projectId: string,
      channel: "internal" | "external",
      body: string,
      mentions: string[] | undefined,
      meta: RequestMeta
    ) => {
      const { member } = await assertProjectAccess(accessRepo, actor, projectId);
      if (channel === "internal" && !canInternalChat(actor.role, member?.role)) {
        throw new ForbiddenError("No tienes acceso al chat interno");
      }
      const projectMembers = await memberRepository.listProjectMembers(projectId);
      const allowedTargetRoles = new Set(allowedMentionRolesByActor(actor.role));
      const memberRoleBySub = new Map(projectMembers.map((m) => [m.userSub, m.role]));

      const mentionSubs: string[] = [];
      const requestedMentions = [...new Set(mentions ?? [])];
      for (const mentionedSub of requestedMentions) {
        const targetRole = memberRoleBySub.get(mentionedSub);
        if (!targetRole) {
          throw new BadRequestError("Solo puedes mencionar participantes del proyecto");
        }
        if (!allowedTargetRoles.has(targetRole) || !canReceiveMentionInChannel(channel, targetRole)) {
          throw new BadRequestError("No puedes mencionar a este participante en el canal seleccionado");
        }
        mentionSubs.push(mentionedSub);
      }

      const row = await db.transaction(async (tx) => {
      const txChatRepository = createChatRepository(tx);
      const txNotificationRepository = createNotificationRepository(tx);
      await createMemberRepository(tx).touchProjectMemberActivity(projectId, actor.sub);
      const row = await txChatRepository.createChatMessage({
        projectId,
        channel,
        messageType: "text",
        authorSub: actor.sub,
        authorEmail: actor.email,
        body,
      });
      if (mentionSubs.length > 0) {
        await txChatRepository.createChatMentions(row.id, mentionSubs);
      }
      if (mentionSubs.length > 0) {
        const preview = body.trim().slice(0, 240);
        await txNotificationRepository.createMentionNotifications(
          mentionSubs
            .filter((sub) => sub !== actor.sub)
            .map((recipientSub) => ({
              projectId,
              messageId: row.id,
              channel,
              recipientSub,
              authorSub: actor.sub,
              authorEmail: actor.email,
              messagePreview: preview,
            }))
        );
      }
      await txChatRepository.markChatMessagesRead([
        { messageId: row.id, userSub: actor.sub, readAt: new Date() },
      ]);
      await createAuditRepository(tx).createAuditLog({
        actorSub: actor.sub,
        action: `chat_${channel}_message_created`,
        resourceType: "project_chat_message",
        resourceId: row.id,
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      });

      const eventType = channel === "internal" ? "chat.message.internal" : "chat.message.external";
      await collabEvents.emit(eventType, projectId, actor.sub, {
        messageId: row.id,
        channel,
        body,
      }, tx);

      if (mentionSubs.length > 0) {
        await collabEvents.emit("chat.mention", projectId, actor.sub, {
          messageId: row.id,
          channel,
          mentionedSubs: mentionSubs,
          body,
        }, tx);
      }
      return row;
      });

      const { profiles } = await getUserProfilesFromSnapshots([actor.sub]);
      const profile = profiles.get(actor.sub);

      return {
        ...row,
        authorFirstName: profile?.firstName ?? null,
        authorLastName: profile?.lastName ?? null,
        authorRole: member?.role ?? profile?.role ?? null,
        authorProfession: profile?.profession ?? null,
        mentionedSubs: mentionSubs.length > 0 ? mentionSubs : null,
        readStatus: {
          isSeen: true,
          requiredCount: 0,
          seenCount: 0,
        },
      };
    },

    markChatAsRead: async (
      actor: Actor,
      projectId: string,
      channel: "internal" | "external",
      payload: { upToMessageId?: string; messageIds: string[] }
    ) => {
      const { member } = await assertProjectAccess(accessRepo, actor, projectId);
      if (channel === "internal" && !canInternalChat(actor.role, member?.role)) {
        throw new ForbiddenError("No tienes acceso al chat interno");
      }

      const rowsToMark: string[] = [];
      let markedUpTo = false;

      if (payload.upToMessageId) {
        const target = await chatRepository.findChatMessageByIdInChannel(
          projectId,
          channel,
          payload.upToMessageId
        );
        if (target) {
          await chatRepository.markChatMessagesReadUpTo(projectId, channel, target.createdAt, actor.sub);
          await notificationRepository.markMentionNotificationsSeenUpTo(actor.sub, projectId, channel, target.createdAt);
          markedUpTo = true;
        }
      }
      if (payload.messageIds.length > 0) {
        rowsToMark.push(...await chatRepository.listChatMessageIdsInChannel(projectId, channel, payload.messageIds));
      }

      const uniqueIds = [...new Set(rowsToMark)];
      if (!uniqueIds.length && !markedUpTo) return { marked: 0 };

      const CHUNK_SIZE = 500;
      for (let i = 0; i < uniqueIds.length; i += CHUNK_SIZE) {
        const chunk = uniqueIds.slice(i, i + CHUNK_SIZE);
        const existingReads = await chatRepository.listChatReadsByMessages(chunk);
        const alreadyReadIds = new Set(
          existingReads.filter((r) => r.userSub === actor.sub).map((r) => r.messageId)
        );
        const unreadIds = chunk.filter((id) => !alreadyReadIds.has(id));

        if (unreadIds.length > 0) {
          await chatRepository.markChatMessagesRead(
            unreadIds.map((id) => ({ messageId: id, userSub: actor.sub, readAt: new Date() }))
          );
        }

        // Marcar notificaciones de mención leídas en lotes de 500 para evitar desbordes de parámetros SQL
        await notificationRepository.markMentionNotificationsSeenByMessages(actor.sub, chunk);
      }

      return { marked: uniqueIds.length };
    },
  };
};
