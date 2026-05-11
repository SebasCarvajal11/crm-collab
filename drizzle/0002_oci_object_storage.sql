-- ═══════════════════════════════════════════════════════════════════════════
-- Migración 0002: Almacenamiento en OCI Object Storage
-- ═══════════════════════════════════════════════════════════════════════════

-- Eliminar columna file_data (base64) — archivos ahora se almacenan en OCI
ALTER TABLE schema_collab.project_files
  DROP COLUMN IF EXISTS file_data;
