-- Migration 0016: Optimizar collab_outbox con índices parciales activo y publicado
CREATE INDEX IF NOT EXISTS "collab_outbox_active_idx" 
ON "schema_collab"."collab_outbox" ("created_at" ASC) 
WHERE status IN ('pending', 'failed', 'processing');--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "collab_outbox_published_at_idx" 
ON "schema_collab"."collab_outbox" ("published_at" ASC) 
WHERE status = 'published';
