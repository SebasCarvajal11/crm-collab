ALTER TABLE "schema_collab"."project_tasks" ADD COLUMN "block_reason" text;--> statement-breakpoint
ALTER TABLE "schema_collab"."project_tasks" ADD COLUMN "block_type" varchar(30);--> statement-breakpoint
ALTER TABLE "schema_collab"."project_tasks" ADD COLUMN "blocked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "schema_collab"."project_tasks" ADD COLUMN "blocked_by_sub" uuid;--> statement-breakpoint
ALTER TABLE "schema_collab"."project_tasks" ADD COLUMN "client_approval_requested_at" timestamp with time zone;--> statement-breakpoint

UPDATE "schema_collab"."project_task_columns"
SET "is_client_visible" = true,
    "title" = CASE
      WHEN "key" = 'doing' AND "title" = 'Haciendo' THEN 'En Curso'
      WHEN "key" = 'client_approval' AND "title" = 'En Aprobación Cliente' THEN 'En Aprobación'
      WHEN "key" = 'done' AND "title" = 'Hecho' THEN 'Terminado'
      ELSE "title"
    END
WHERE "key" IN ('doing', 'client_approval', 'blocked', 'done');--> statement-breakpoint

UPDATE "schema_collab"."project_tasks" pt
SET "is_client_visible" = true
FROM "schema_collab"."project_task_columns" ptc
WHERE pt."column_id" = ptc."id"
  AND ptc."key" IN ('doing', 'client_approval', 'blocked', 'done')
  AND pt."is_client_visible" = false;
