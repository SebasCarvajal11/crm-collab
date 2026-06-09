CREATE SCHEMA IF NOT EXISTS "schema_collab";
--> statement-breakpoint
CREATE TYPE "schema_collab"."change_request_status" AS ENUM('open', 'accepted', 'rejected', 'escalated', 'approved');--> statement-breakpoint
CREATE TYPE "schema_collab"."change_request_type" AS ENUM('minor', 'formal');--> statement-breakpoint
CREATE TYPE "schema_collab"."chat_channel" AS ENUM('internal', 'external', 'system');--> statement-breakpoint
CREATE TYPE "schema_collab"."chat_message_type" AS ENUM('text', 'minor_request', 'formal_request', 'milestone');--> statement-breakpoint
CREATE TYPE "schema_collab"."file_folder" AS ENUM('mockups', 'final_arts', 'briefs', 'contracts', 'shared_deliverables');--> statement-breakpoint
CREATE TYPE "schema_collab"."file_origin" AS ENUM('internal_chat', 'external_chat', 'manual_upload');--> statement-breakpoint
CREATE TYPE "schema_collab"."parent_project_status" AS ENUM('todo', 'in_progress', 'in_review', 'completed');--> statement-breakpoint
CREATE TYPE "schema_collab"."project_member_role" AS ENUM('admin', 'worker', 'client');--> statement-breakpoint
CREATE TYPE "schema_collab"."project_type" AS ENUM('campaign_service', 'product_order');--> statement-breakpoint
CREATE TYPE "schema_collab"."task_column_key" AS ENUM('pending', 'doing', 'internal_review', 'client_approval', 'blocked', 'done', 'art_approved', 'in_production', 'quality_control', 'shipped', 'completed', 'waiting_material');--> statement-breakpoint
CREATE TYPE "schema_collab"."task_priority" AS ENUM('low', 'medium', 'high', 'urgent');--> statement-breakpoint
CREATE TABLE "schema_collab"."audit_logs" (
	"id" bigserial NOT NULL,
	"actor_sub" uuid,
	"action" varchar(120) NOT NULL,
	"resource_type" varchar(80) NOT NULL,
	"resource_id" uuid,
	"ip_address" varchar(45),
	"user_agent" varchar(500),
	"details" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "audit_logs_id_created_at_pk" PRIMARY KEY("id","created_at")
);
--> statement-breakpoint
CREATE TABLE "schema_collab"."media_access_cache" (
	"object_key" text NOT NULL,
	"force_download" boolean NOT NULL,
	"url" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "media_access_cache_object_key_force_download_pk" PRIMARY KEY("object_key","force_download")
);
--> statement-breakpoint
CREATE TABLE "schema_collab"."project_brief_change_log" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"requested_by_sub" uuid NOT NULL,
	"approved_by_sub" uuid,
	"description" text NOT NULL,
	"source_change_request_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "schema_collab"."project_briefs" (
	"project_id" uuid PRIMARY KEY NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"updated_by_sub" uuid NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "schema_collab"."project_change_requests" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"task_id" uuid,
	"type" "schema_collab"."change_request_type" NOT NULL,
	"status" "schema_collab"."change_request_status" DEFAULT 'open' NOT NULL,
	"requested_by_sub" uuid NOT NULL,
	"resolved_by_sub" uuid,
	"title" varchar(200) NOT NULL,
	"description" text NOT NULL,
	"justification" text,
	"channel_message_id" uuid,
	"escalated_by_worker_sub" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"resolved_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "schema_collab"."project_chat_mentions" (
	"message_id" uuid NOT NULL,
	"user_sub" uuid NOT NULL,
	CONSTRAINT "project_chat_mentions_message_id_user_sub_pk" PRIMARY KEY("message_id","user_sub")
);
--> statement-breakpoint
CREATE TABLE "schema_collab"."project_chat_message_reads" (
	"message_id" uuid NOT NULL,
	"user_sub" uuid NOT NULL,
	"read_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "project_chat_message_reads_message_id_user_sub_pk" PRIMARY KEY("message_id","user_sub")
);
--> statement-breakpoint
CREATE TABLE "schema_collab"."project_chat_messages" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"channel" "schema_collab"."chat_channel" NOT NULL,
	"message_type" "schema_collab"."chat_message_type" DEFAULT 'text' NOT NULL,
	"author_sub" uuid,
	"author_email" varchar(255),
	"body" text NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "schema_collab"."project_files" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"task_id" uuid,
	"title" varchar(200),
	"description" text,
	"origin" "schema_collab"."file_origin" NOT NULL,
	"folder" "schema_collab"."file_folder" NOT NULL,
	"file_name" varchar(255) NOT NULL,
	"storage_path" text NOT NULL,
	"mime_type" varchar(120) NOT NULL,
	"size_bytes" bigint DEFAULT 0 NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_client_visible" boolean DEFAULT false NOT NULL,
	"approved_by_client" boolean DEFAULT false NOT NULL,
	"approved_by_sub" uuid,
	"approved_at" timestamp,
	"created_by_sub" uuid NOT NULL,
	"created_by_email" varchar(255),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "schema_collab"."project_members" (
	"project_id" uuid NOT NULL,
	"user_sub" uuid NOT NULL,
	"role" "schema_collab"."project_member_role" NOT NULL,
	"user_email" varchar(255),
	"last_seen_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "project_members_project_id_user_sub_pk" PRIMARY KEY("project_id","user_sub")
);
--> statement-breakpoint
CREATE TABLE "schema_collab"."project_mention_notifications" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"message_id" uuid NOT NULL,
	"channel" "schema_collab"."chat_channel" NOT NULL,
	"recipient_sub" uuid NOT NULL,
	"author_sub" uuid,
	"author_email" varchar(255),
	"message_preview" varchar(240) NOT NULL,
	"is_seen" boolean DEFAULT false NOT NULL,
	"seen_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "schema_collab"."project_subtasks" (
	"id" uuid PRIMARY KEY NOT NULL,
	"task_id" uuid NOT NULL,
	"title" varchar(255) NOT NULL,
	"is_completed" boolean DEFAULT false NOT NULL,
	"assignee_sub" uuid,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "schema_collab"."project_task_assignees" (
	"task_id" uuid NOT NULL,
	"user_sub" uuid NOT NULL,
	"user_email" varchar(255) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "project_task_assignees_task_id_user_sub_pk" PRIMARY KEY("task_id","user_sub")
);
--> statement-breakpoint
CREATE TABLE "schema_collab"."project_task_columns" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"key" "schema_collab"."task_column_key" NOT NULL,
	"title" varchar(80) NOT NULL,
	"position" integer NOT NULL,
	"is_client_visible" boolean DEFAULT false NOT NULL,
	"is_default" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "schema_collab"."project_task_comments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"task_id" uuid NOT NULL,
	"author_sub" uuid NOT NULL,
	"author_email" varchar(255) NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "schema_collab"."project_tasks" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"column_id" uuid NOT NULL,
	"title" varchar(180) NOT NULL,
	"description" text,
	"priority" "schema_collab"."task_priority" DEFAULT 'medium' NOT NULL,
	"assignee_sub" uuid,
	"reporter_sub" uuid NOT NULL,
	"deadline" timestamp,
	"checklist_progress" integer DEFAULT 0 NOT NULL,
	"blocked_by_task_id" uuid,
	"is_client_visible" boolean DEFAULT false NOT NULL,
	"position" integer NOT NULL,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "schema_collab"."projects" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" varchar(140) NOT NULL,
	"description" text,
	"client_name" varchar(160) NOT NULL,
	"client_sub" uuid,
	"type" "schema_collab"."project_type" NOT NULL,
	"status" "schema_collab"."parent_project_status" DEFAULT 'todo' NOT NULL,
	"progress_percent" integer DEFAULT 0 NOT NULL,
	"admin_responsible_sub" uuid NOT NULL,
	"estimated_due_date" timestamp,
	"unread_notifications" integer DEFAULT 0 NOT NULL,
	"latest_approved_file_id" uuid,
	"is_archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "schema_collab"."user_identity_snapshots" (
	"user_sub" uuid PRIMARY KEY NOT NULL,
	"email" varchar(255) NOT NULL,
	"role" varchar(20) NOT NULL,
	"first_name" varchar(120),
	"last_name" varchar(120),
	"client_kind" varchar(20),
	"company_name" varchar(160),
	"profession" varchar(160),
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "schema_collab"."project_brief_change_log" ADD CONSTRAINT "project_brief_change_log_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "schema_collab"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schema_collab"."project_brief_change_log" ADD CONSTRAINT "project_brief_change_log_source_change_request_id_project_change_requests_id_fk" FOREIGN KEY ("source_change_request_id") REFERENCES "schema_collab"."project_change_requests"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schema_collab"."project_briefs" ADD CONSTRAINT "project_briefs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "schema_collab"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schema_collab"."project_change_requests" ADD CONSTRAINT "project_change_requests_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "schema_collab"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schema_collab"."project_change_requests" ADD CONSTRAINT "project_change_requests_task_id_project_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "schema_collab"."project_tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schema_collab"."project_chat_mentions" ADD CONSTRAINT "project_chat_mentions_message_id_project_chat_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "schema_collab"."project_chat_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schema_collab"."project_chat_message_reads" ADD CONSTRAINT "project_chat_message_reads_message_id_project_chat_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "schema_collab"."project_chat_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schema_collab"."project_chat_messages" ADD CONSTRAINT "project_chat_messages_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "schema_collab"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schema_collab"."project_files" ADD CONSTRAINT "project_files_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "schema_collab"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schema_collab"."project_files" ADD CONSTRAINT "project_files_task_id_project_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "schema_collab"."project_tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schema_collab"."project_members" ADD CONSTRAINT "project_members_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "schema_collab"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schema_collab"."project_mention_notifications" ADD CONSTRAINT "project_mention_notifications_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "schema_collab"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schema_collab"."project_mention_notifications" ADD CONSTRAINT "project_mention_notifications_message_id_project_chat_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "schema_collab"."project_chat_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schema_collab"."project_subtasks" ADD CONSTRAINT "project_subtasks_task_id_project_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "schema_collab"."project_tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schema_collab"."project_task_assignees" ADD CONSTRAINT "project_task_assignees_task_id_project_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "schema_collab"."project_tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schema_collab"."project_task_columns" ADD CONSTRAINT "project_task_columns_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "schema_collab"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schema_collab"."project_task_comments" ADD CONSTRAINT "project_task_comments_task_id_project_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "schema_collab"."project_tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schema_collab"."project_tasks" ADD CONSTRAINT "project_tasks_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "schema_collab"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schema_collab"."project_tasks" ADD CONSTRAINT "project_tasks_column_id_project_task_columns_id_fk" FOREIGN KEY ("column_id") REFERENCES "schema_collab"."project_task_columns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_media_access_cache_expires_at" ON "schema_collab"."media_access_cache" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "idx_project_brief_change_log_project_id" ON "schema_collab"."project_brief_change_log" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "idx_project_change_requests_project_id" ON "schema_collab"."project_change_requests" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "idx_project_chat_message_reads_user_sub" ON "schema_collab"."project_chat_message_reads" USING btree ("user_sub");--> statement-breakpoint
CREATE INDEX "idx_project_chat_messages_project_id" ON "schema_collab"."project_chat_messages" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "idx_project_chat_messages_project_channel_created" ON "schema_collab"."project_chat_messages" USING btree ("project_id","channel","created_at");--> statement-breakpoint
CREATE INDEX "idx_project_files_project_id" ON "schema_collab"."project_files" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "idx_project_files_task_id" ON "schema_collab"."project_files" USING btree ("task_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_mention_notification_message_recipient" ON "schema_collab"."project_mention_notifications" USING btree ("message_id","recipient_sub");--> statement-breakpoint
CREATE INDEX "idx_mention_notification_recipient_seen" ON "schema_collab"."project_mention_notifications" USING btree ("recipient_sub","is_seen");--> statement-breakpoint
CREATE INDEX "idx_mention_notification_created_at" ON "schema_collab"."project_mention_notifications" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_project_subtasks_task_id" ON "schema_collab"."project_subtasks" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "idx_task_assignees_task_id" ON "schema_collab"."project_task_assignees" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "idx_project_task_columns_project_id" ON "schema_collab"."project_task_columns" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_project_task_columns_project_key" ON "schema_collab"."project_task_columns" USING btree ("project_id","key");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_project_task_columns_project_position" ON "schema_collab"."project_task_columns" USING btree ("project_id","position");--> statement-breakpoint
CREATE INDEX "idx_task_comments_task_id" ON "schema_collab"."project_task_comments" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "idx_project_tasks_project_id" ON "schema_collab"."project_tasks" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "idx_project_tasks_project_column_position" ON "schema_collab"."project_tasks" USING btree ("project_id","column_id","position","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "project_name_admin_uq" ON "schema_collab"."projects" USING btree ("admin_responsible_sub","name");--> statement-breakpoint
CREATE INDEX "idx_user_identity_snapshots_email" ON "schema_collab"."user_identity_snapshots" USING btree ("email");