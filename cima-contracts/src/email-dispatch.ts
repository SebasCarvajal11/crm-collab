import { z } from "zod";

/** Internal command: only Media owns rendering, queueing and delivery. */
export const EMAIL_DISPATCH_CONTRACT = { version: 1, status: "supported", owner: "crm-media" } as const;
export const emailTemplateNameSchema = z.enum([
  "password_reset", "client_invite", "worker_invite", "admin_invite", "email_verify",
]);
export const emailDispatchRequestSchema = z.object({
  version: z.literal(1),
  id: z.string().uuid(),
  expiresAt: z.string().datetime(),
  to: z.string().email().max(255),
  replyTo: z.string().email().optional(),
  template: z.object({
    name: emailTemplateNameSchema,
    variables: z.object({ token: z.string().min(1).max(512) }).strict(),
  }).strict().optional(),
  content: z.object({
    subject: z.string().min(1).max(250),
    html: z.string().min(1).max(100_000),
    text: z.string().min(1).max(100_000),
  }).strict().optional(),
}).strict().refine((value) => Boolean(value.template) !== Boolean(value.content), {
  message: "Specify exactly one of template or content",
});
export const emailDispatchResponseSchema = z.object({
  success: z.literal(true),
  messageId: z.string().min(1),
  status: z.literal("queued"),
});
export type EmailDispatchRequest = z.infer<typeof emailDispatchRequestSchema>;
export type EmailDispatchResponse = z.infer<typeof emailDispatchResponseSchema>;
export type EmailTemplateName = z.infer<typeof emailTemplateNameSchema>;
