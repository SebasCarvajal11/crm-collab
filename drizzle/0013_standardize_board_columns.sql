-- Migration: 0013_standardize_board_columns.sql
-- Description: Estandarización canónica de columnas del tablero kanban entre campañas y productos.

-- 1. Insertar columnas canónicas faltantes para todos los proyectos existentes
INSERT INTO "schema_collab"."project_task_columns" (
  "id", "project_id", "key", "title", "position", "is_client_visible", "is_default", "created_at", "updated_at"
)
SELECT 
  gen_random_uuid(),
  p.id,
  def.key::schema_collab.task_column_key,
  def.title,
  def.position,
  def.is_client_visible,
  true,
  NOW(),
  NOW()
FROM "schema_collab"."projects" p
CROSS JOIN (
  VALUES 
    ('pending', 'Pendiente', 0, false),
    ('doing', 'En Curso', 1, true),
    ('internal_review', 'En Revisión Interna', 2, false),
    ('client_approval', 'En Aprobación', 3, true),
    ('blocked', 'Bloqueado', 4, true),
    ('done', 'Terminado', 5, true)
) AS def(key, title, position, is_client_visible)
WHERE NOT EXISTS (
  SELECT 1 FROM "schema_collab"."project_task_columns" c
  WHERE c.project_id = p.id AND c.key = def.key::schema_collab.task_column_key
);--> statement-breakpoint

-- 2. Reasignación determinista de tareas desde columnas legacy hacia columnas canónicas
-- art_approved -> doing (visible al cliente)
UPDATE "schema_collab"."project_tasks" pt
SET 
  "column_id" = target_col.id,
  "is_client_visible" = true,
  "updated_at" = NOW()
FROM "schema_collab"."project_task_columns" old_col
JOIN "schema_collab"."project_task_columns" target_col 
  ON target_col.project_id = old_col.project_id AND target_col.key = 'doing'
WHERE pt.column_id = old_col.id
  AND old_col.key = 'art_approved';--> statement-breakpoint

-- in_production -> doing (visible al cliente)
UPDATE "schema_collab"."project_tasks" pt
SET 
  "column_id" = target_col.id,
  "is_client_visible" = true,
  "updated_at" = NOW()
FROM "schema_collab"."project_task_columns" old_col
JOIN "schema_collab"."project_task_columns" target_col 
  ON target_col.project_id = old_col.project_id AND target_col.key = 'doing'
WHERE pt.column_id = old_col.id
  AND old_col.key = 'in_production';--> statement-breakpoint

-- quality_control -> internal_review
UPDATE "schema_collab"."project_tasks" pt
SET 
  "column_id" = target_col.id,
  "updated_at" = NOW()
FROM "schema_collab"."project_task_columns" old_col
JOIN "schema_collab"."project_task_columns" target_col 
  ON target_col.project_id = old_col.project_id AND target_col.key = 'internal_review'
WHERE pt.column_id = old_col.id
  AND old_col.key = 'quality_control';--> statement-breakpoint

-- waiting_material -> blocked (enriquecer razon de bloqueo y visibilidad)
UPDATE "schema_collab"."project_tasks" pt
SET 
  "column_id" = target_col.id,
  "block_reason" = COALESCE(NULLIF(pt.block_reason, ''), 'Esperando material'),
  "block_type" = COALESCE(NULLIF(pt.block_type, ''), 'material'),
  "blocked_at" = COALESCE(pt.blocked_at, NOW()),
  "is_client_visible" = true,
  "updated_at" = NOW()
FROM "schema_collab"."project_task_columns" old_col
JOIN "schema_collab"."project_task_columns" target_col 
  ON target_col.project_id = old_col.project_id AND target_col.key = 'blocked'
WHERE pt.column_id = old_col.id
  AND old_col.key = 'waiting_material';--> statement-breakpoint

-- shipped -> client_approval (enriquecer fecha de solicitud y visibilidad)
UPDATE "schema_collab"."project_tasks" pt
SET 
  "column_id" = target_col.id,
  "client_approval_requested_at" = COALESCE(pt.client_approval_requested_at, NOW()),
  "is_client_visible" = true,
  "updated_at" = NOW()
FROM "schema_collab"."project_task_columns" old_col
JOIN "schema_collab"."project_task_columns" target_col 
  ON target_col.project_id = old_col.project_id AND target_col.key = 'client_approval'
WHERE pt.column_id = old_col.id
  AND old_col.key = 'shipped';--> statement-breakpoint

-- completed -> done (visible al cliente)
UPDATE "schema_collab"."project_tasks" pt
SET 
  "column_id" = target_col.id,
  "is_client_visible" = true,
  "updated_at" = NOW()
FROM "schema_collab"."project_task_columns" old_col
JOIN "schema_collab"."project_task_columns" target_col 
  ON target_col.project_id = old_col.project_id AND target_col.key = 'done'
WHERE pt.column_id = old_col.id
  AND old_col.key = 'completed';--> statement-breakpoint

-- 3. Eliminar columnas legacy de productos ahora que no tienen tareas asociadas
DELETE FROM "schema_collab"."project_task_columns"
WHERE "key" IN ('art_approved', 'in_production', 'quality_control', 'waiting_material', 'shipped', 'completed')
  AND NOT EXISTS (
    SELECT 1 FROM "schema_collab"."project_tasks" pt WHERE pt.column_id = "schema_collab"."project_task_columns".id
  );--> statement-breakpoint

-- 4. Normalizar titulos, posiciones y visibilidad para las 6 columnas canónicas
UPDATE "schema_collab"."project_task_columns"
SET 
  "title" = CASE "key"
    WHEN 'pending' THEN 'Pendiente'
    WHEN 'doing' THEN 'En Curso'
    WHEN 'internal_review' THEN 'En Revisión Interna'
    WHEN 'client_approval' THEN 'En Aprobación'
    WHEN 'blocked' THEN 'Bloqueado'
    WHEN 'done' THEN 'Terminado'
    ELSE "title"
  END,
  "position" = CASE "key"
    WHEN 'pending' THEN 0
    WHEN 'doing' THEN 1
    WHEN 'internal_review' THEN 2
    WHEN 'client_approval' THEN 3
    WHEN 'blocked' THEN 4
    WHEN 'done' THEN 5
    ELSE "position"
  END,
  "is_client_visible" = CASE "key"
    WHEN 'pending' THEN false
    WHEN 'doing' THEN true
    WHEN 'internal_review' THEN false
    WHEN 'client_approval' THEN true
    WHEN 'blocked' THEN true
    WHEN 'done' THEN true
    ELSE "is_client_visible"
  END,
  "updated_at" = NOW()
WHERE "key" IN ('pending', 'doing', 'internal_review', 'client_approval', 'blocked', 'done');--> statement-breakpoint

-- 5. Sincronizar visibilidad de tareas según la visibilidad de su columna
UPDATE "schema_collab"."project_tasks" pt
SET "is_client_visible" = true
FROM "schema_collab"."project_task_columns" ptc
WHERE pt."column_id" = ptc."id"
  AND ptc."is_client_visible" = true
  AND pt."is_client_visible" = false;--> statement-breakpoint

-- 6. Recalcular estado y progreso porcentual de todos los proyectos
WITH task_agg AS (
  SELECT
    p.id AS project_id,
    COUNT(t.id)::int AS total,
    COUNT(t.id) FILTER (WHERE c.key = 'done')::int AS done_count,
    COUNT(t.id) FILTER (WHERE c.key = 'client_approval')::int AS review_count,
    COUNT(t.id) FILTER (WHERE c.key <> 'pending')::int AS non_pending_count,
    COALESCE(ROUND(AVG(
      CASE c.key
        WHEN 'pending' THEN 0
        WHEN 'doing' THEN 25
        WHEN 'internal_review' THEN 50
        WHEN 'client_approval' THEN 75
        WHEN 'blocked' THEN 10
        WHEN 'done' THEN 100
        ELSE 0
      END
    ))::int, 0) AS progress_avg
  FROM schema_collab.projects p
  LEFT JOIN schema_collab.project_tasks t ON t.project_id = p.id
  LEFT JOIN schema_collab.project_task_columns c ON c.id = t.column_id
  GROUP BY p.id
)
UPDATE schema_collab.projects p
SET
  status = CASE
    WHEN a.total > 0 AND a.total = a.done_count THEN 'completed'::schema_collab.parent_project_status
    WHEN a.total > 0 AND a.review_count > 0 THEN 'in_review'::schema_collab.parent_project_status
    WHEN a.total > 0 AND a.non_pending_count > 0 THEN 'in_progress'::schema_collab.parent_project_status
    ELSE 'todo'::schema_collab.parent_project_status
  END,
  progress_percent = a.progress_avg,
  updated_at = NOW()
FROM task_agg a
WHERE p.id = a.project_id;
