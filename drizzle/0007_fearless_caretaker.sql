ALTER TABLE "schema_collab"."collab_outbox" ADD COLUMN "claim_token" uuid;--> statement-breakpoint
ALTER TABLE "schema_collab"."collab_outbox" ADD COLUMN "claimed_at" timestamp;--> statement-breakpoint
CREATE INDEX "collab_outbox_status_claimed_idx" ON "schema_collab"."collab_outbox" USING btree ("status","claimed_at");