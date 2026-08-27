import { db } from "../../../db/connection";
import type { CollabEvent, CollabEventPayload } from "../events";
import { createMemberRepository } from "../member/member.repository";
import { createActivityNotificationRepository } from "./activity-notification.repository";
import { getRedisConnection } from "../../../shared/redis";

type Activity = { channel: "internal" | "external"; title: string; body: string; resourceType: string; resourceId?: string; recipients?: string[] };
type Member = { userSub: string; role: "admin" | "worker" | "client" };

const text = (value: unknown, fallback: string) => typeof value === "string" && value.trim() ? value.slice(0, 300) : fallback;

/** Materializa sólo eventos que tienen una acción visible para una persona. */
export async function persistActivityNotification(event: CollabEvent<CollabEventPayload>): Promise<void> {
  const data = event.data as Record<string, unknown>;
  const activity = describe(event.type, data);
  if (!activity) return;

  const members = await createMemberRepository(db).listProjectMembers(event.projectId);
  const recipients = resolveActivityRecipients(members, event.actorSub, activity.channel, activity.recipients);

  const created = await createActivityNotificationRepository(db).create(
    recipients.map((member) => ({
      eventId: event.id,
      projectId: event.projectId,
      recipientSub: member.userSub,
      actorSub: event.actorSub,
      channel: activity.channel,
      kind: event.type,
      title: activity.title,
      body: activity.body,
      resourceType: activity.resourceType,
      resourceId: activity.resourceId ?? null,
    }))
  );
  const redis = getRedisConnection();
  if (redis && created.length > 0) {
    await redis.hincrby("metrics:notifications:created", event.type, created.length).catch(() => undefined);
  }
}

export function resolveActivityRecipients(
  members: Member[],
  actorSub: string,
  channel: "internal" | "external",
  explicitRecipients?: string[]
): Member[] {
  if (explicitRecipients) {
    const allowed = new Set(explicitRecipients);
    return members.filter((member) => member.userSub !== actorSub && allowed.has(member.userSub));
  }
  return members.filter((member) => member.userSub !== actorSub && (channel === "external" || member.role !== "client"));
}

function describe(type: CollabEvent<CollabEventPayload>["type"], data: Record<string, unknown>): Activity | null {
  const taskTitle = text(data.taskTitle, "una tarea");
  switch (type) {
    case "task.assigned":
      return { channel: "internal", title: "Nueva tarea asignada", body: taskTitle, resourceType: "project_task", resourceId: text(data.taskId, ""), recipients: [text(data.assigneeSub, "")] };
    case "task.moved":
      return { channel: data.clientVisible === true ? "external" : "internal", title: "Tarea actualizada", body: `${taskTitle} cambió de etapa`, resourceType: "project_task", resourceId: text(data.taskId, ""), recipients: arrayOfStrings(data.assigneeSubs) ?? [] };
    case "task.comment.created":
      return { channel: data.clientVisible === true ? "external" : "internal", title: "Nuevo comentario en tarea", body: taskTitle, resourceType: "project_task", resourceId: text(data.taskId, ""), recipients: arrayOfStrings(data.assigneeSubs) ?? [] };
    case "change_request.minor.created":
    case "change_request.formal.created":
      return { channel: "internal", title: "Nueva solicitud de cambio", body: text(data.title, "Solicitud de cambio"), resourceType: "project_change_request", resourceId: text(data.changeRequestId, "") };
    case "change_request.minor.accepted":
    case "change_request.minor.rejected":
    case "change_request.formal.approved":
    case "change_request.formal.rejected":
      return { channel: "external", title: "Solicitud de cambio resuelta", body: text(data.title, "Tu solicitud fue actualizada"), resourceType: "project_change_request", resourceId: text(data.changeRequestId, ""), recipients: [text(data.requestedBySub, "")] };
    case "file.uploaded":
      return { channel: data.isClientVisible === true ? "external" : "internal", title: "Archivo cargado", body: text(data.fileName, "Nuevo archivo"), resourceType: "project_file", resourceId: text(data.fileId, "") };
    case "file.approved":
      return { channel: "internal", title: "Archivo aprobado", body: text(data.fileName, "Un archivo fue aprobado"), resourceType: "project_file", resourceId: text(data.fileId, "") };
    case "project.created":
      return { channel: "external", title: "Nuevo proyecto", body: text(data.projectName, "Tienes acceso a un proyecto"), resourceType: "project", resourceId: text(data.projectId, "") };
    case "project.updated":
      return { channel: "external", title: "Proyecto actualizado", body: text(data.projectName, "El proyecto fue actualizado"), resourceType: "project", resourceId: text(data.projectId, "") };
    default:
      return null;
  }
}

function arrayOfStrings(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.filter((item): item is string => typeof item === "string" && item.length > 0);
}
