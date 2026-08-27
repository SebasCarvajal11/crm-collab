ALTER TYPE "schema_collab"."task_column_key" ADD VALUE IF NOT EXISTS 'on_hold';--> statement-breakpoint
CREATE TABLE "schema_collab"."project_activity_notifications" (
	"id" uuid PRIMARY KEY NOT NULL,
	"event_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"recipient_sub" uuid NOT NULL,
	"actor_sub" uuid,
	"channel" "schema_collab"."chat_channel" NOT NULL,
	"kind" varchar(80) NOT NULL,
	"title" varchar(180) NOT NULL,
	"body" varchar(300) NOT NULL,
	"resource_type" varchar(80) NOT NULL,
	"resource_id" varchar(255),
	"is_seen" boolean DEFAULT false NOT NULL,
	"seen_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "schema_collab"."project_activity_notifications" ADD CONSTRAINT "project_activity_notifications_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "schema_collab"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_activity_notification_event_recipient" ON "schema_collab"."project_activity_notifications" USING btree ("event_id","recipient_sub");--> statement-breakpoint
CREATE INDEX "idx_activity_notification_recipient_seen_created" ON "schema_collab"."project_activity_notifications" USING btree ("recipient_sub","is_seen","created_at");--> statement-breakpoint
CREATE INDEX "idx_activity_notification_project_created" ON "schema_collab"."project_activity_notifications" USING btree ("project_id","created_at");
