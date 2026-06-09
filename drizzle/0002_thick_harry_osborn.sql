CREATE TABLE IF NOT EXISTS "schema_collab"."schema_version" (
	"id" serial PRIMARY KEY NOT NULL,
	"version" varchar(50) NOT NULL,
	"applied_by" varchar(100) NOT NULL,
	"applied_at" timestamp with time zone DEFAULT now() NOT NULL,
	"source" varchar(255) NOT NULL
);
--> statement-breakpoint
ALTER TABLE "schema_collab"."audit_logs" ALTER COLUMN "resource_id" SET DATA TYPE varchar(255);--> statement-breakpoint
ALTER TABLE "schema_collab"."audit_logs" ADD COLUMN "actor_email" varchar(255);--> statement-breakpoint
ALTER TABLE "schema_collab"."audit_logs" ADD COLUMN "actor_role" varchar(20);--> statement-breakpoint
ALTER TABLE "schema_collab"."audit_logs" ADD COLUMN "correlation_id" uuid;