import { z } from "zod";
import "dotenv/config";

const pemFromEnv = z
  .string()
  .min(1)
  .transform((s) => s.replace(/\\n/g, "\n").trim());

const envSchema = z
  .object({
    DATABASE_URL: z.string().min(1, "DATABASE_URL es requerida"),
    PORT: z.coerce.number().default(3001),
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
    MOD_COLLAB_CORS: z
      .union([z.literal("true"), z.literal("false")])
      .default("false")
      .transform((v) => v === "true"),
    CORS_ORIGIN: z.string().default("http://localhost:5173"),
    TRUST_GATEWAY_JWT_HEADERS: z
      .union([z.literal("true"), z.literal("false"), z.literal("1"), z.literal("0")])
      .default("true")
      .transform((v) => v === "true" || v === "1"),
    GATEWAY_TRUST_SECRET: z.string().min(32),
    JWT_PUBLIC_KEY: pemFromEnv.optional(),
    JWT_ISS: z.string().optional(),
    MOD_AUTH_URL: z.string().url().default("http://mod-auth:3000"),
    // Oracle Cloud Object Storage (S3-compatible)
    OCI_NAMESPACE: z.string().min(1, "OCI_NAMESPACE es requerida"),
    OCI_REGION: z.string().min(1, "OCI_REGION es requerida"),
    OCI_ACCESS_KEY: z.string().min(1, "OCI_ACCESS_KEY es requerida"),
    OCI_SECRET_KEY: z.string().min(1, "OCI_SECRET_KEY es requerida"),
    OCI_BUCKET: z.string().min(1, "OCI_BUCKET es requerida"),
  })
  .superRefine((data, ctx) => {
    if (!data.TRUST_GATEWAY_JWT_HEADERS && !data.JWT_PUBLIC_KEY) {
      ctx.addIssue({
        code: "custom",
        message: "JWT_PUBLIC_KEY es requerida cuando TRUST_GATEWAY_JWT_HEADERS=false",
        path: ["JWT_PUBLIC_KEY"],
      });
    }
  });

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Variables de entorno invalidas en mod-collab");
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
