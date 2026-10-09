import { describe, expect, it } from "vitest";
import { describe as describeActivity, resolveActivityRecipients } from "./activity-notification.handler";

const members = [
  { userSub: "admin", role: "admin" as const },
  { userSub: "worker", role: "worker" as const },
  { userSub: "client", role: "client" as const },
];

describe("resolveActivityRecipients", () => {
  it("never includes a client in an internal notification", () => {
    expect(resolveActivityRecipients(members, "admin", "internal").map(({ userSub }) => userSub)).toEqual(["worker"]);
  });

  it("includes project members other than the actor for client-visible activity", () => {
    expect(resolveActivityRecipients(members, "worker", "external").map(({ userSub }) => userSub)).toEqual(["admin", "client"]);
  });

  it("limits assignment activity to its selected recipients and excludes the actor", () => {
    expect(resolveActivityRecipients(members, "admin", "internal", ["admin", "worker"]).map(({ userSub }) => userSub)).toEqual(["worker"]);
  });

  it("does not drop all recipients when explicitRecipients is an empty array", () => {
    expect(resolveActivityRecipients(members, "admin", "internal", []).map(({ userSub }) => userSub)).toEqual(["worker"]);
  });

  it("excludes already mentioned members from activity notifications", () => {
    expect(resolveActivityRecipients(members, "admin", "external", undefined, ["worker"]).map(({ userSub }) => userSub)).toEqual(["client"]);
  });
});

describe("describeActivity", () => {
  it("generates activity notification for task.blocked with reason", () => {
    const activity = describeActivity("task.blocked", {
      taskId: "task-123",
      taskTitle: "Diseño de Landing",
      blockReason: "Falta definición del copy",
      clientVisible: false,
    });

    expect(activity).toEqual({
      channel: "internal",
      title: "Tarea bloqueada",
      body: 'bloqueó la tarea "Diseño de Landing": Falta definición del copy',
      resourceType: "project_task",
      resourceId: "task-123",
    });
  });

  it("generates activity notification for task.blocked without reason and client visible", () => {
    const activity = describeActivity("task.blocked", {
      taskId: "task-456",
      taskTitle: "Producción de Video",
      clientVisible: true,
    });

    expect(activity).toEqual({
      channel: "external",
      title: "Tarea bloqueada",
      body: 'bloqueó la tarea "Producción de Video"',
      resourceType: "project_task",
      resourceId: "task-456",
    });
  });

  it("generates activity notification for task.unblocked", () => {
    const activity = describeActivity("task.unblocked", {
      taskId: "task-123",
      taskTitle: "Diseño de Landing",
      clientVisible: true,
    });

    expect(activity).toEqual({
      channel: "external",
      title: "Tarea desbloqueada",
      body: 'desbloqueó la tarea "Diseño de Landing"',
      resourceType: "project_task",
      resourceId: "task-123",
    });
  });
});
