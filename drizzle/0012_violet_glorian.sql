DO $$ BEGIN
    CREATE TYPE "schema_collab"."amendment_fee_payment_type" AS ENUM('one_time', 'monthly_recurring');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint

DO $$ BEGIN
    CREATE TYPE "schema_collab"."amendment_type" AS ENUM('services', 'economic', 'extension', 'mixed');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "schema_collab"."project_contract_amendments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"contract_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"amendment_number" integer NOT NULL,
	"title" varchar(255) NOT NULL,
	"amendment_type" "schema_collab"."amendment_type" DEFAULT 'services' NOT NULL,
	"status" "schema_collab"."contract_status" DEFAULT 'draft' NOT NULL,
	"service_scope" text NOT NULL,
	"additional_fee" integer DEFAULT 0 NOT NULL,
	"fee_payment_type" "schema_collab"."amendment_fee_payment_type" DEFAULT 'one_time' NOT NULL,
	"term_months_extension" integer DEFAULT 0 NOT NULL,
	"additional_terms" text,
	"client_request_notes" text,
	"content_snapshot" text,
	"content_hash" varchar(64),
	"prepared_by_sub" uuid NOT NULL,
	"requested_signature_at" timestamp,
	"signed_at" timestamp,
	"signed_by_sub" uuid,
	"signer_name" varchar(200),
	"signature_data_url" text,
	"consent_accepted_at" timestamp,
	"signed_ip_address" varchar(45),
	"signed_user_agent" varchar(500),
	"signature_city" varchar(120) DEFAULT 'Bogotá, D.C.' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint

ALTER TABLE "schema_collab"."project_change_requests" ADD COLUMN IF NOT EXISTS "priority" varchar(20) DEFAULT 'medium' NOT NULL;--> statement-breakpoint
ALTER TABLE "schema_collab"."project_change_requests" ADD COLUMN IF NOT EXISTS "resolution_comment" text;--> statement-breakpoint

ALTER TABLE "schema_collab"."project_tasks" ADD COLUMN IF NOT EXISTS "block_reason" text;--> statement-breakpoint
ALTER TABLE "schema_collab"."project_tasks" ADD COLUMN IF NOT EXISTS "block_type" varchar(30);--> statement-breakpoint
ALTER TABLE "schema_collab"."project_tasks" ADD COLUMN IF NOT EXISTS "blocked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "schema_collab"."project_tasks" ADD COLUMN IF NOT EXISTS "blocked_by_sub" uuid;--> statement-breakpoint
ALTER TABLE "schema_collab"."project_tasks" ADD COLUMN IF NOT EXISTS "client_approval_requested_at" timestamp with time zone;--> statement-breakpoint

DO $$ BEGIN
    ALTER TABLE "schema_collab"."project_contract_amendments" 
    ADD CONSTRAINT "project_contract_amendments_contract_id_project_contracts_id_fk" 
    FOREIGN KEY ("contract_id") REFERENCES "schema_collab"."project_contracts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint

DO $$ BEGIN
    ALTER TABLE "schema_collab"."project_contract_amendments" 
    ADD CONSTRAINT "project_contract_amendments_project_id_projects_id_fk" 
    FOREIGN KEY ("project_id") REFERENCES "schema_collab"."projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "uq_project_amendment_number" ON "schema_collab"."project_contract_amendments" USING btree ("contract_id","amendment_number");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_project_amendments_contract_id" ON "schema_collab"."project_contract_amendments" USING btree ("contract_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_project_amendments_project_id" ON "schema_collab"."project_contract_amendments" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_project_amendments_status" ON "schema_collab"."project_contract_amendments" USING btree ("status");--> statement-breakpoint

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