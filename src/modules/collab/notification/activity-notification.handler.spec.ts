import { describe, expect, it } from "vitest";
import { resolveActivityRecipients } from "./activity-notification.handler";

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
});
