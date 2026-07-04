CREATE TABLE "legal_contract_relationships_organization" (
	"id" text PRIMARY KEY NOT NULL,
	"legal_contract_id" text NOT NULL,
	"relationships_organization_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "legal_contract_relationships_person" (
	"id" text PRIMARY KEY NOT NULL,
	"legal_contract_id" text NOT NULL,
	"relationships_person_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "legal_contract_suppliers_supplier" (
	"id" text PRIMARY KEY NOT NULL,
	"legal_contract_id" text NOT NULL,
	"suppliers_supplier_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE UNIQUE INDEX "legal_contract_relationships_organization_pair_idx" ON "legal_contract_relationships_organization" USING btree ("legal_contract_id","relationships_organization_id") WHERE "deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "legal_contract_relationships_organization_l_uniq" ON "legal_contract_relationships_organization" USING btree ("legal_contract_id") WHERE "deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "legal_contract_relationships_organization_r_idx" ON "legal_contract_relationships_organization" USING btree ("relationships_organization_id") WHERE "deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "legal_contract_relationships_person_pair_idx" ON "legal_contract_relationships_person" USING btree ("legal_contract_id","relationships_person_id") WHERE "deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "legal_contract_relationships_person_l_uniq" ON "legal_contract_relationships_person" USING btree ("legal_contract_id") WHERE "deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "legal_contract_relationships_person_r_idx" ON "legal_contract_relationships_person" USING btree ("relationships_person_id") WHERE "deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "legal_contract_suppliers_supplier_pair_idx" ON "legal_contract_suppliers_supplier" USING btree ("legal_contract_id","suppliers_supplier_id") WHERE "deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "legal_contract_suppliers_supplier_l_uniq" ON "legal_contract_suppliers_supplier" USING btree ("legal_contract_id") WHERE "deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "legal_contract_suppliers_supplier_r_idx" ON "legal_contract_suppliers_supplier" USING btree ("suppliers_supplier_id") WHERE "deleted_at" IS NULL;