-- ═══════════════════════════════════════════════════════════════════════════
-- Migración 0001: Funcionalidades de tarea (comentarios, asignados, archivos)
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. Extender project_files con soporte para archivos de tarea
ALTER TABLE schema_collab.project_files
  ADD COLUMN IF NOT EXISTS task_id      UUID REFERENCES schema_collab.project_tasks(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS title        VARCHAR(200),
  ADD COLUMN IF NOT EXISTS description  TEXT,
  ADD COLUMN IF NOT EXISTS file_data    TEXT,
  ADD COLUMN IF NOT EXISTS created_by_email VARCHAR(255);

-- 2. Asignados múltiples por tarea
CREATE TABLE IF NOT EXISTS schema_collab.project_task_assignees (
  task_id     UUID        NOT NULL REFERENCES schema_collab.project_tasks(id) ON DELETE CASCADE,
  user_sub    UUID        NOT NULL,
  user_email  VARCHAR(255) NOT NULL,
  created_at  TIMESTAMP   NOT NULL DEFAULT NOW(),
  PRIMARY KEY (task_id, user_sub)
);

-- 3. Comentarios de tarea
CREATE TABLE IF NOT EXISTS schema_collab.project_task_comments (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id      UUID        NOT NULL REFERENCES schema_collab.project_tasks(id) ON DELETE CASCADE,
  author_sub   UUID        NOT NULL,
  author_email VARCHAR(255) NOT NULL,
  content      TEXT        NOT NULL,
  created_at   TIMESTAMP   NOT NULL DEFAULT NOW()
);

-- Índices para rendimiento
CREATE INDEX IF NOT EXISTS idx_task_comments_task_id  ON schema_collab.project_task_comments(task_id);
CREATE INDEX IF NOT EXISTS idx_task_assignees_task_id ON schema_collab.project_task_assignees(task_id);
CREATE INDEX IF NOT EXISTS idx_project_files_task_id  ON schema_collab.project_files(task_id);
