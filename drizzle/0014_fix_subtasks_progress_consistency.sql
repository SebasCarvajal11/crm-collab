-- Migración 0014: Coherencia integral de subtareas, progreso de tareas y proyectos
-- 1. Recalcular checklist_progress como porcentaje real de subtareas completadas
UPDATE schema_collab.project_tasks t
SET checklist_progress = sub.calc_progress,
    updated_at = NOW()
FROM (
  SELECT task_id,
         ROUND((COUNT(id) FILTER (WHERE is_completed = true)::numeric / COUNT(id)) * 100)::int as calc_progress
  FROM schema_collab.project_subtasks
  GROUP BY task_id
) sub
WHERE t.id = sub.task_id AND t.checklist_progress <> sub.calc_progress;

-- 2. Mover tareas con checklist_progress < 100 que estén en 'done' a la columna 'pending'
UPDATE schema_collab.project_tasks t
SET column_id = target_col.id,
    completed_at = NULL,
    updated_at = NOW()
FROM schema_collab.project_task_columns c
JOIN schema_collab.project_task_columns target_col
  ON target_col.project_id = c.project_id AND target_col.key = 'pending'
WHERE t.column_id = c.id
  AND c.key = 'done'
  AND t.checklist_progress < 100;

-- 3. Limpiar completed_at en tareas que no pertenecen a la columna final
UPDATE schema_collab.project_tasks t
SET completed_at = NULL,
    updated_at = NOW()
FROM schema_collab.project_task_columns c
WHERE t.column_id = c.id
  AND c.key <> 'done'
  AND t.completed_at IS NOT NULL;

-- 4. Garantizar que las tareas que permanecen en 'done' tengan completed_at no nulo y progreso al 100%
UPDATE schema_collab.project_tasks t
SET completed_at = COALESCE(t.completed_at, NOW()),
    checklist_progress = 100,
    updated_at = NOW()
FROM schema_collab.project_task_columns c
WHERE t.column_id = c.id
  AND c.key = 'done'
  AND (t.completed_at IS NULL OR t.checklist_progress <> 100);

-- 5. Sanitizar motivo y tipo de bloqueo en tareas de la columna 'blocked' con campos en blanco
UPDATE schema_collab.project_tasks t
SET block_reason = CASE WHEN TRIM(COALESCE(block_reason, '')) = '' THEN 'Impedimento interno' ELSE block_reason END,
    block_type = CASE WHEN TRIM(COALESCE(block_type, '')) = '' THEN 'internal_impediment' ELSE block_type END,
    blocked_at = COALESCE(blocked_at, NOW()),
    updated_at = NOW()
FROM schema_collab.project_task_columns c
WHERE t.column_id = c.id
  AND c.key = 'blocked'
  AND (TRIM(COALESCE(t.block_reason, '')) = '' OR TRIM(COALESCE(t.block_type, '')) = '');

-- 6. Recalcular estado y progreso canónico de todos los proyectos
WITH task_agg AS (
  SELECT
    p.id AS project_id,
    COUNT(t.id)::int AS total,
    COUNT(t.id) FILTER (WHERE c.key = 'done')::int AS done_count,
    COUNT(t.id) FILTER (WHERE c.key = 'client_approval')::int AS review_count,
    COUNT(t.id) FILTER (WHERE c.key <> 'pending')::int AS non_pending_count,
    COALESCE(ROUND(AVG(
      CASE
        WHEN (SELECT COUNT(s.id) FROM schema_collab.project_subtasks s WHERE s.task_id = t.id) > 0
          THEN t.checklist_progress
        WHEN c.key = 'pending' THEN 0
        WHEN c.key = 'doing' THEN 25
        WHEN c.key = 'internal_review' THEN 50
        WHEN c.key = 'client_approval' THEN 75
        WHEN c.key = 'blocked' THEN 10
        WHEN c.key = 'done' THEN 100
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
