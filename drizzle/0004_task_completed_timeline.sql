ALTER TABLE "schema_collab"."project_tasks"
ADD COLUMN IF NOT EXISTS "completed_at" timestamp;

UPDATE "schema_collab"."project_tasks" AS t
SET "completed_at" = COALESCE(t."completed_at", t."updated_at")
FROM "schema_collab"."project_task_columns" AS c
WHERE c."id" = t."column_id"
  AND c."key" IN ('done', 'completed')
  AND t."checklist_progress" = 100
  AND t."completed_at" IS NULL;
