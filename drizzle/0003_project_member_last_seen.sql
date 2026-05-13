ALTER TABLE schema_collab.project_members
  ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_project_members_project_last_seen
  ON schema_collab.project_members(project_id, last_seen_at);
