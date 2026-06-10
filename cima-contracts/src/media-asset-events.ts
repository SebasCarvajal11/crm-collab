import { z } from "zod";

export const MEDIA_ASSET_CONTRACT_VERSION = 1 as const;

export const mediaCommandActorSchema = z.object({
  sub: z.string().uuid(),
  userId: z.string().min(1),
  role: z.enum(["admin", "worker", "client"]),
  email: z.string().email(),
});

export const fileUploadUrlRequestedSchema = z.object({
  version: z.literal(1).default(1),
  contractVersion: z.literal(MEDIA_ASSET_CONTRACT_VERSION).default(MEDIA_ASSET_CONTRACT_VERSION),
  type: z.literal("file.upload-url-requested"),
  traceId: z.string().optional(),
  correlationId: z.string().uuid(),
  requestedAt: z.string().optional(),
  objectKey: z.string().min(1),
  fileName: z.string().min(1).max(255),
  mimeType: z.string().min(1).max(120),
  sizeBytes: z.coerce.number().int().min(1).max(25 * 1024 * 1024),
  actor: mediaCommandActorSchema,
  signature: z.string().regex(/^[a-f0-9]{64}$/i),
});

export const fileMetadataRequestedSchema = z.object({
  version: z.literal(1).default(1),
  contractVersion: z.literal(MEDIA_ASSET_CONTRACT_VERSION).default(MEDIA_ASSET_CONTRACT_VERSION),
  type: z.literal("file.metadata-requested"),
  traceId: z.string().optional(),
  correlationId: z.string().uuid(),
  requestedAt: z.string().optional(),
  objectKey: z.string().min(1),
  fileName: z.string().min(1).max(255),
  mimeType: z.string().min(1).max(120),
  sizeBytes: z.coerce.number().int().min(1).max(25 * 1024 * 1024),
  actor: mediaCommandActorSchema,
  signature: z.string().regex(/^[a-f0-9]{64}$/i),
});

export const fileAccessRequestedSchema = z.object({
  version: z.literal(1).default(1),
  contractVersion: z.literal(MEDIA_ASSET_CONTRACT_VERSION).default(MEDIA_ASSET_CONTRACT_VERSION),
  type: z.literal("file.access-requested"),
  traceId: z.string().optional(),
  correlationId: z.string().uuid(),
  requestedAt: z.string().optional(),
  objectKey: z.string().min(1),
  forceDownload: z.boolean().default(false),
  actor: mediaCommandActorSchema,
  signature: z.string().regex(/^[a-f0-9]{64}$/i),
});

export const fileDeleteRequestedSchema = z.object({
  version: z.literal(1).default(1),
  contractVersion: z.literal(MEDIA_ASSET_CONTRACT_VERSION).default(MEDIA_ASSET_CONTRACT_VERSION),
  type: z.literal("file.delete-requested"),
  traceId: z.string().optional(),
  correlationId: z.string().uuid(),
  requestedAt: z.string().optional(),
  objectKey: z.string().min(1),
  actor: mediaCommandActorSchema,
  signature: z.string().regex(/^[a-f0-9]{64}$/i),
});

export const mediaCommandSchema = z.discriminatedUnion("type", [
  fileUploadUrlRequestedSchema,
  fileMetadataRequestedSchema,
  fileAccessRequestedSchema,
  fileDeleteRequestedSchema,
]);

export const fileUploadUrlCreatedSchema = z.object({
  version: z.literal(1).default(1),
  contractVersion: z.literal(MEDIA_ASSET_CONTRACT_VERSION).default(MEDIA_ASSET_CONTRACT_VERSION),
  type: z.literal("file.upload-url-created"),
  traceId: z.string().optional(),
  correlationId: z.string().uuid(),
  objectKey: z.string().min(1),
  uploadUrl: z.string().min(1),
  expiresInSeconds: z.number().int().positive(),
});

export const fileMetadataResolvedSchema = z.object({
  version: z.literal(1).default(1),
  contractVersion: z.literal(MEDIA_ASSET_CONTRACT_VERSION).default(MEDIA_ASSET_CONTRACT_VERSION),
  type: z.literal("file.metadata-resolved"),
  traceId: z.string().optional(),
  correlationId: z.string().uuid(),
  objectKey: z.string().min(1),
  sizeBytes: z.number().int().positive(),
  mimeType: z.string().min(1),
});

export const fileAccessGrantedSchema = z.object({
  version: z.literal(1).default(1),
  contractVersion: z.literal(MEDIA_ASSET_CONTRACT_VERSION).default(MEDIA_ASSET_CONTRACT_VERSION),
  type: z.literal("file.access-granted"),
  traceId: z.string().optional(),
  correlationId: z.string().uuid(),
  objectKey: z.string().min(1),
  url: z.string().min(1),
  expiresInSeconds: z.number().int().positive(),
});

export const fileDeletedSchema = z.object({
  version: z.literal(1).default(1),
  contractVersion: z.literal(MEDIA_ASSET_CONTRACT_VERSION).default(MEDIA_ASSET_CONTRACT_VERSION),
  type: z.literal("file.deleted"),
  traceId: z.string().optional(),
  correlationId: z.string().uuid(),
  objectKey: z.string().min(1),
});

export const fileCommandFailedSchema = z.object({
  version: z.literal(1).default(1),
  contractVersion: z.literal(MEDIA_ASSET_CONTRACT_VERSION).default(MEDIA_ASSET_CONTRACT_VERSION),
  type: z.literal("file.command-failed"),
  traceId: z.string().optional(),
  correlationId: z.string().uuid(),
  objectKey: z.string().min(1).optional(),
  statusCode: z.number().int(),
  message: z.string().min(1),
});

export const mediaResponseSchema = z.discriminatedUnion("type", [
  fileUploadUrlCreatedSchema,
  fileMetadataResolvedSchema,
  fileAccessGrantedSchema,
  fileDeletedSchema,
  fileCommandFailedSchema,
]);

export type MediaCommandActor = z.infer<typeof mediaCommandActorSchema>;
export type MediaCommand = z.infer<typeof mediaCommandSchema>;
export type MediaResponse = z.infer<typeof mediaResponseSchema>;
export type FileUploadUrlRequested = z.infer<typeof fileUploadUrlRequestedSchema>;
export type FileMetadataRequested = z.infer<typeof fileMetadataRequestedSchema>;
export type FileAccessRequested = z.infer<typeof fileAccessRequestedSchema>;
export type FileDeleteRequested = z.infer<typeof fileDeleteRequestedSchema>;
export type FileUploadUrlCreated = z.infer<typeof fileUploadUrlCreatedSchema>;
export type FileMetadataResolved = z.infer<typeof fileMetadataResolvedSchema>;
export type FileAccessGranted = z.infer<typeof fileAccessGrantedSchema>;
export type FileDeleted = z.infer<typeof fileDeletedSchema>;
export type FileCommandFailed = z.infer<typeof fileCommandFailedSchema>;
