CREATE INDEX "idx_project_change_requests_project_type_created" ON "schema_collab"."project_change_requests" USING btree ("project_id","type","created_at");--> statement-breakpoint
CREATE INDEX "idx_project_change_requests_timeline" ON "schema_collab"."project_change_requests" USING btree ("project_id","status","resolved_at");--> statement-breakpoint
CREATE INDEX "idx_project_files_project_client_created" ON "schema_collab"."project_files" USING btree ("project_id","is_client_visible","created_at");--> statement-breakpoint
CREATE INDEX "idx_project_members_user_project" ON "schema_collab"."project_members" USING btree ("user_sub","project_id");--> statement-breakpoint
CREATE INDEX "idx_project_tasks_project_position_created" ON "schema_collab"."project_tasks" USING btree ("project_id","position","created_at");--> statement-breakpoint
CREATE INDEX "idx_project_tasks_project_client_position" ON "schema_collab"."project_tasks" USING btree ("project_id","is_client_visible","position","created_at");--> statement-breakpoint
CREATE INDEX "idx_projects_active_updated" ON "schema_collab"."projects" USING btree ("is_archived","updated_at");