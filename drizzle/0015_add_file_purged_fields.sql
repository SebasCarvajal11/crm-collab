-- Migración 0015: Agregar soporte para purgado de archivos y administración de almacenamiento
ALTER TABLE "schema_collab"."project_files" ADD COLUMN IF NOT EXISTS "is_purged" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "schema_collab"."project_files" ADD COLUMN IF NOT EXISTS "purged_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "schema_collab"."project_files" ADD COLUMN IF NOT EXISTS "purged_by_sub" uuid;--> statement-breakpoint
ALTER TABLE "schema_collab"."project_files" ADD COLUMN IF NOT EXISTS "purged_reason" varchar(255);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_project_files_purged" ON "schema_collab"."project_files" ("is_purged", "size_bytes");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_project_files_project_folder" ON "schema_collab"."project_files" ("project_id", "folder", "is_purged");
