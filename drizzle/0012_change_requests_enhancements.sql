ALTER TABLE "schema_collab"."project_change_requests" ADD COLUMN "priority" varchar(20) DEFAULT 'medium' NOT NULL;--> statement-breakpoint
ALTER TABLE "schema_collab"."project_change_requests" ADD COLUMN "resolution_comment" text;
