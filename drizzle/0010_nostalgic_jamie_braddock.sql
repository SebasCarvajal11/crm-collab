CREATE TYPE "schema_collab"."contract_client_kind" AS ENUM('natural', 'juridical');--> statement-breakpoint
CREATE TYPE "schema_collab"."contract_provider_kind" AS ENUM('cima', 'independent');--> statement-breakpoint
CREATE TYPE "schema_collab"."contract_status" AS ENUM('draft', 'pending_signature', 'signed');--> statement-breakpoint
CREATE TABLE "schema_collab"."project_contracts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"status" "schema_collab"."contract_status" DEFAULT 'draft' NOT NULL,
	"provider_kind" "schema_collab"."contract_provider_kind" DEFAULT 'cima' NOT NULL,
	"provider_name" varchar(200) NOT NULL,
	"provider_tax_id" varchar(80),
	"provider_representative" varchar(200),
	"client_kind" "schema_collab"."contract_client_kind" NOT NULL,
	"client_name" varchar(200) NOT NULL,
	"client_document" varchar(80),
	"client_company_name" varchar(200),
	"client_tax_id" varchar(80),
	"client_representative" varchar(200),
	"client_representative_document" varchar(80),
	"client_email" varchar(255) NOT NULL,
	"client_phone" varchar(50),
	"plan_name" varchar(160) NOT NULL,
	"monthly_fee" integer NOT NULL,
	"currency" varchar(3) DEFAULT 'COP' NOT NULL,
	"tax_included" boolean DEFAULT true NOT NULL,
	"term_months" integer NOT NULL,
	"service_scope" text NOT NULL,
	"additional_terms" text,
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
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "schema_collab"."project_contracts" ADD CONSTRAINT "project_contracts_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "schema_collab"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_project_contracts_project_id" ON "schema_collab"."project_contracts" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "idx_project_contracts_status" ON "schema_collab"."project_contracts" USING btree ("status");