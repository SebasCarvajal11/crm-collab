import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleAuthEvent } from "./auth-event-handler";
import * as snapshotStore from "../../../shared/identity-snapshot-store";

vi.mock("../../../shared/identity-snapshot-store", () => ({
  upsertUserIdentitySnapshot: vi.fn(),
  deleteUserIdentitySnapshot: vi.fn(),
  anonymizeUserPII: vi.fn(),
}));

vi.mock("../../../shared/redis", () => ({
  getRedisConnection: vi.fn().mockReturnValue(null),
  getRedisSubscriber: vi.fn().mockReturnValue(null),
}));

describe("auth-event-handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Version 1 Events", () => {
    it("should process user.registered V1 event successfully", async () => {
      const eventV1 = {
        version: 1,
        type: "user.registered",
        userSub: "6fcfc258-0cb9-4c28-98e6-12a8684784a9",
        email: "test@cima.dev",
        role: "worker",
        firstName: "Ana",
        lastName: "Martinez",
        clientKind: null,
        companyName: null,
        profession: "Designer",
        timestamp: new Date().toISOString(),
      };

      await handleAuthEvent(eventV1);

      expect(snapshotStore.upsertUserIdentitySnapshot).toHaveBeenCalledWith(
        expect.objectContaining({
          userSub: eventV1.userSub,
          email: eventV1.email,
          role: eventV1.role,
        })
      );
    });

    it("should process user.deleted V1 event successfully", async () => {
      const eventV1 = {
        version: 1,
        type: "user.deleted",
        userSub: "6fcfc258-0cb9-4c28-98e6-12a8684784a9",
        email: "test@cima.dev",
        role: "worker",
        firstName: null,
        lastName: null,
        clientKind: null,
        companyName: null,
        profession: null,
        timestamp: new Date().toISOString(),
      };

      await handleAuthEvent(eventV1);

      expect(snapshotStore.anonymizeUserPII).toHaveBeenCalledWith(
        eventV1.userSub
      );
    });

    it("should assume version 1 if version is undefined (legacy compatibility)", async () => {
      const eventV1Legacy = {
        type: "user.registered",
        userSub: "6fcfc258-0cb9-4c28-98e6-12a8684784a9",
        email: "test@cima.dev",
        role: "worker",
        firstName: "Ana",
        lastName: "Martinez",
        clientKind: null,
        companyName: null,
        profession: "Designer",
        timestamp: new Date().toISOString(),
      };

      await handleAuthEvent(eventV1Legacy);

      expect(snapshotStore.upsertUserIdentitySnapshot).toHaveBeenCalled();
    });

    it("should process user.registered V1 event successfully and ignore unrecognized extra fields", async () => {
      const eventV1WithExtra = {
        version: 1,
        type: "user.registered",
        userSub: "6fcfc258-0cb9-4c28-98e6-12a8684784a9",
        email: "test@cima.dev",
        role: "worker",
        firstName: "Ana",
        lastName: "Martinez",
        clientKind: null,
        companyName: null,
        profession: "Designer",
        unrecognizedExtraField: "extraValue", // new field not in V1 contract
        timestamp: new Date().toISOString(),
      };

      await handleAuthEvent(eventV1WithExtra);

      expect(snapshotStore.upsertUserIdentitySnapshot).toHaveBeenCalledWith(
        expect.objectContaining({
          userSub: eventV1WithExtra.userSub,
          email: eventV1WithExtra.email,
          role: eventV1WithExtra.role,
        })
      );
    });
  });

  describe("Version 2 Events", () => {
    it("should process user.registered V2 event successfully and tolerate new fields", async () => {
      const eventV2 = {
        version: 2,
        type: "user.registered",
        userSub: "7f23c4a2-1b15-46fb-89ad-2cb2d075ebf9",
        email: "v2@cima.dev",
        role: "client",
        firstName: "Jose",
        lastName: "Sanz",
        clientKind: "natural",
        companyName: "Jose S.A.",
        profession: "Engineer",
        phoneNumber: "+123456789", // V2 field
        address: "123 Main St",     // V2 field
        timestamp: new Date().toISOString(),
      };

      await handleAuthEvent(eventV2);

      // Verify V2 fields are stripped, passing only compatible snapshot fields
      expect(snapshotStore.upsertUserIdentitySnapshot).toHaveBeenCalledWith({
        userSub: eventV2.userSub,
        email: eventV2.email,
        role: eventV2.role,
        firstName: eventV2.firstName,
        lastName: eventV2.lastName,
        clientKind: eventV2.clientKind,
        companyName: eventV2.companyName,
        profession: eventV2.profession,
      });
    });

    it("should process user.deleted V2 event successfully", async () => {
      const eventV2Deleted = {
        version: 2,
        type: "user.deleted",
        userSub: "7f23c4a2-1b15-46fb-89ad-2cb2d075ebf9",
        email: "v2@cima.dev",
        role: "client",
        timestamp: new Date().toISOString(),
      };

      await handleAuthEvent(eventV2Deleted);

      expect(snapshotStore.anonymizeUserPII).toHaveBeenCalledWith(
        eventV2Deleted.userSub
      );
    });
  });

  describe("Unsupported Versions & Validation Failures", () => {
    it("should throw non-retryable error for unsupported versions", async () => {
      const eventV3 = {
        version: 3,
        type: "user.registered",
        userSub: "8e9a1b2c-3d4e-4f5a-8b6c-7d8e9f0a1b2c",
        email: "test@cima.dev",
        role: "worker",
        timestamp: new Date().toISOString(),
      };

      await expect(handleAuthEvent(eventV3)).rejects.toThrow("Unsupported event version: 3");
    });

    it("should throw validation error if event V1 payload is malformed", async () => {
      const invalidEventV1 = {
        version: 1,
        type: "user.registered",
        userSub: "invalid-uuid",
        email: "not-an-email",
        role: "invalid-role",
        timestamp: "invalid-date",
      };

      await expect(handleAuthEvent(invalidEventV1)).rejects.toThrow();
    });

    it("should throw validation error if event V2 payload is malformed", async () => {
      const invalidEventV2 = {
        version: 2,
        type: "user.registered",
        userSub: "invalid-uuid",
        email: "not-an-email",
        role: "invalid-role",
        timestamp: "invalid-date",
      };

      await expect(handleAuthEvent(invalidEventV2)).rejects.toThrow();
    });
  });
});
