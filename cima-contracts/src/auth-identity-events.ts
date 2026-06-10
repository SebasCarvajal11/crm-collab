import { z } from "zod";

export const AUTH_IDENTITY_EVENT_CONTRACT_VERSION = 1 as const;

const nullableText = z.string().nullable();
const clientKindSchema = z.enum(["natural", "juridical"]).nullable();
const roleSchema = z.enum(["admin", "worker", "client"]);

const authIdentityEventBaseSchema = z.object({
  version: z.literal(AUTH_IDENTITY_EVENT_CONTRACT_VERSION),
  contractVersion: z.literal(AUTH_IDENTITY_EVENT_CONTRACT_VERSION).default(AUTH_IDENTITY_EVENT_CONTRACT_VERSION),
  userSub: z.string().uuid(),
  email: z.string().email(),
  role: roleSchema,
  firstName: nullableText,
  lastName: nullableText,
  clientKind: clientKindSchema,
  companyName: nullableText,
  profession: nullableText,
  timestamp: z.string().datetime({ offset: true }),
  traceId: z.string().optional(),
  correlationId: z.string().uuid().optional(),
});

export const userRegisteredIdentityEventSchema = authIdentityEventBaseSchema.extend({
  type: z.literal("user.registered"),
});

export const userUpdatedIdentityEventSchema = authIdentityEventBaseSchema.extend({
  type: z.literal("user.updated"),
});

export const userDeletedIdentityEventSchema = authIdentityEventBaseSchema.extend({
  type: z.literal("user.deleted"),
});

export const authIdentityEventV1Schema = z.discriminatedUnion("type", [
  userRegisteredIdentityEventSchema,
  userUpdatedIdentityEventSchema,
  userDeletedIdentityEventSchema,
]);

// Version 2 schema
const authIdentityEventV2BaseSchema = z.object({
  version: z.literal(2),
  contractVersion: z.literal(AUTH_IDENTITY_EVENT_CONTRACT_VERSION).default(AUTH_IDENTITY_EVENT_CONTRACT_VERSION),
  userSub: z.string().uuid(),
  email: z.string().email(),
  role: roleSchema,
  firstName: nullableText.optional(),
  lastName: nullableText.optional(),
  clientKind: clientKindSchema.optional(),
  companyName: nullableText.optional(),
  profession: nullableText.optional(),
  phoneNumber: nullableText.optional(),
  address: nullableText.optional(),
  timestamp: z.string().datetime({ offset: true }),
  traceId: z.string().optional(),
  correlationId: z.string().uuid().optional(),
});

export const userRegisteredIdentityEventV2Schema = authIdentityEventV2BaseSchema.extend({
  type: z.literal("user.registered"),
});

export const userUpdatedIdentityEventV2Schema = authIdentityEventV2BaseSchema.extend({
  type: z.literal("user.updated"),
});

export const userDeletedIdentityEventV2Schema = authIdentityEventV2BaseSchema.extend({
  type: z.literal("user.deleted"),
});

export const authIdentityEventV2Schema = z.discriminatedUnion("type", [
  userRegisteredIdentityEventV2Schema,
  userUpdatedIdentityEventV2Schema,
  userDeletedIdentityEventV2Schema,
]);

// Union supporting both versions
export const authIdentityEventSchema = z.union([
  authIdentityEventV1Schema,
  authIdentityEventV2Schema,
]);

export type AuthIdentityEvent = z.infer<typeof authIdentityEventSchema>;
export type UserRegisteredIdentityEvent = z.infer<typeof userRegisteredIdentityEventSchema>;
export type UserUpdatedIdentityEvent = z.infer<typeof userUpdatedIdentityEventSchema>;
export type UserDeletedIdentityEvent = z.infer<typeof userDeletedIdentityEventSchema>;

export type UserRegisteredIdentityEventV2 = z.infer<typeof userRegisteredIdentityEventV2Schema>;
export type UserUpdatedIdentityEventV2 = z.infer<typeof userUpdatedIdentityEventV2Schema>;
export type UserDeletedIdentityEventV2 = z.infer<typeof userDeletedIdentityEventV2Schema>;
export type AuthIdentityEventV2 = z.infer<typeof authIdentityEventV2Schema>;

export const identityReplayRequestedEventSchema = z.object({
  type: z.literal("identity.replay-requested"),
  timestamp: z.string().datetime({ offset: true }),
  traceId: z.string().optional(),
  correlationId: z.string().uuid(),
});

export type IdentityReplayRequestedEvent = z.infer<typeof identityReplayRequestedEventSchema>;
