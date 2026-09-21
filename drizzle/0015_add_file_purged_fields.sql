-- Migración 0015: Agregar soporte para purgado de archivos y administración de almacenamiento
ALTER TABLE schema_collab.project_files 
  ADD COLUMN IF NOT EXISTS is_purged boolean DEFAULT false NOT NULL,
  ADD COLUMN IF NOT EXISTS purged_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS purged_by_sub uuid,
  ADD COLUMN IF NOT EXISTS purged_reason varchar(255);

CREATE INDEX IF NOT EXISTS idx_project_files_purged ON schema_collab.project_files(is_purged, size_bytes);
CREATE INDEX IF NOT EXISTS idx_project_files_project_folder ON schema_collab.project_files(project_id, folder, is_purged);
