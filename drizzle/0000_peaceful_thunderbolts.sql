CREATE SCHEMA "schema_collab";
--> statement-breakpoint
CREATE TYPE "schema_collab"."task_priority" AS ENUM('low', 'medium', 'high', 'urgent');--> statement-breakpoint
CREATE TYPE "schema_collab"."task_status" AS ENUM('todo', 'in_progress', 'in_review', 'done', 'blocked');--> statement-breakpoint
CREATE TYPE "schema_collab"."workspace_role" AS ENUM('owner', 'manager', 'contributor', 'viewer', 'client');--> statement-breakpoint
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
CREATE TABLE "schema_collab"."board_columns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"board_id" uuid NOT NULL,
	"title" varchar(80) NOT NULL,
	"position" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "schema_collab"."boards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" varchar(140) NOT NULL,
	"description" text,
	"created_by_sub" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "schema_collab"."task_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid NOT NULL,
	"author_sub" uuid NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "schema_collab"."tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"board_id" uuid NOT NULL,
	"column_id" uuid NOT NULL,
	"title" varchar(180) NOT NULL,
	"description" text,
	"priority" "schema_collab"."task_priority" DEFAULT 'medium' NOT NULL,
	"status" "schema_collab"."task_status" DEFAULT 'todo' NOT NULL,
	"assignee_sub" uuid,
	"reporter_sub" uuid NOT NULL,
	"due_date" timestamp,
	"client_visible" boolean DEFAULT false NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "schema_collab"."workspace_members" (
	"workspace_id" uuid NOT NULL,
	"user_sub" uuid NOT NULL,
	"role" "schema_collab"."workspace_role" NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "workspace_members_workspace_id_user_sub_pk" PRIMARY KEY("workspace_id","user_sub")
);
--> statement-breakpoint
CREATE TABLE "schema_collab"."workspaces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(140) NOT NULL,
	"description" text,
	"owner_sub" uuid NOT NULL,
	"is_archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "schema_collab"."board_columns" ADD CONSTRAINT "board_columns_board_id_boards_id_fk" FOREIGN KEY ("board_id") REFERENCES "schema_collab"."boards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schema_collab"."boards" ADD CONSTRAINT "boards_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "schema_collab"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schema_collab"."task_comments" ADD CONSTRAINT "task_comments_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "schema_collab"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schema_collab"."tasks" ADD CONSTRAINT "tasks_board_id_boards_id_fk" FOREIGN KEY ("board_id") REFERENCES "schema_collab"."boards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schema_collab"."tasks" ADD CONSTRAINT "tasks_column_id_board_columns_id_fk" FOREIGN KEY ("column_id") REFERENCES "schema_collab"."board_columns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schema_collab"."workspace_members" ADD CONSTRAINT "workspace_members_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "schema_collab"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_name_owner_uq" ON "schema_collab"."workspaces" USING btree ("owner_sub","name");