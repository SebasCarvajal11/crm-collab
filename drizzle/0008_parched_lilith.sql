WITH duplicate_groups AS (
  SELECT project_id, file_name
  FROM schema_collab.project_files
  GROUP BY project_id, file_name
  HAVING COUNT(*) <> COUNT(DISTINCT version)
), ranked AS (
  SELECT files.id,
    ROW_NUMBER() OVER (
      PARTITION BY files.project_id, files.file_name
      ORDER BY files.version ASC, files.created_at ASC, files.id ASC
    )::int AS version
  FROM schema_collab.project_files AS files
  INNER JOIN duplicate_groups AS duplicates
    ON duplicates.project_id = files.project_id
    AND duplicates.file_name = files.file_name
)
UPDATE schema_collab.project_files AS files
SET version = ranked.version
FROM ranked
WHERE files.id = ranked.id;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_project_files_project_name_version" ON "schema_collab"."project_files" USING btree ("project_id","file_name","version");
