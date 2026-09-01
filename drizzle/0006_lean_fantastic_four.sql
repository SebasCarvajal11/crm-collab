CREATE INDEX "idx_activity_notification_seen_at" ON "schema_collab"."project_activity_notifications" USING btree ("is_seen","seen_at");--> statement-breakpoint
CREATE INDEX "idx_project_chat_messages_author_sub" ON "schema_collab"."project_chat_messages" USING btree ("author_sub");--> statement-breakpoint
CREATE INDEX "idx_project_files_created_by_sub" ON "schema_collab"."project_files" USING btree ("created_by_sub");--> statement-breakpoint
CREATE INDEX "idx_mention_notification_author_sub" ON "schema_collab"."project_mention_notifications" USING btree ("author_sub");--> statement-breakpoint
CREATE INDEX "idx_mention_notification_seen_at" ON "schema_collab"."project_mention_notifications" USING btree ("is_seen","seen_at");--> statement-breakpoint
CREATE INDEX "idx_task_assignees_user_sub" ON "schema_collab"."project_task_assignees" USING btree ("user_sub");--> statement-breakpoint
CREATE INDEX "idx_task_comments_author_sub" ON "schema_collab"."project_task_comments" USING btree ("author_sub");