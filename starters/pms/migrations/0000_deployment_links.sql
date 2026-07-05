CREATE TABLE "legal_contract_bookings_booking" (
	"id" text PRIMARY KEY NOT NULL,
	"legal_contract_id" text NOT NULL,
	"bookings_booking_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "legal_contract_finance_invoice" (
	"id" text PRIMARY KEY NOT NULL,
	"legal_contract_id" text NOT NULL,
	"finance_invoice_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "legal_policyAcceptance_bookings_booking" (
	"id" text PRIMARY KEY NOT NULL,
	"legal_policyAcceptance_id" text NOT NULL,
	"bookings_booking_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "legal_policy_products_product" (
	"id" text PRIMARY KEY NOT NULL,
	"legal_policy_id" text NOT NULL,
	"products_product_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "relationships_organization_products_product" (
	"id" text PRIMARY KEY NOT NULL,
	"relationships_organization_id" text NOT NULL,
	"products_product_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "relationships_person_products_product" (
	"id" text PRIMARY KEY NOT NULL,
	"relationships_person_id" text NOT NULL,
	"products_product_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE UNIQUE INDEX "legal_contract_bookings_booking_pair_idx" ON "legal_contract_bookings_booking" USING btree ("legal_contract_id","bookings_booking_id") WHERE "deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "legal_contract_bookings_booking_l_uniq" ON "legal_contract_bookings_booking" USING btree ("legal_contract_id") WHERE "deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "legal_contract_bookings_booking_r_idx" ON "legal_contract_bookings_booking" USING btree ("bookings_booking_id") WHERE "deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "legal_contract_finance_invoice_pair_idx" ON "legal_contract_finance_invoice" USING btree ("legal_contract_id","finance_invoice_id") WHERE "deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "legal_contract_finance_invoice_l_idx" ON "legal_contract_finance_invoice" USING btree ("legal_contract_id") WHERE "deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "legal_contract_finance_invoice_r_uniq" ON "legal_contract_finance_invoice" USING btree ("finance_invoice_id") WHERE "deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "legal_policyAcceptance_bookings_booking_pair_idx" ON "legal_policyAcceptance_bookings_booking" USING btree ("legal_policyAcceptance_id","bookings_booking_id") WHERE "deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "legal_policyAcceptance_bookings_booking_l_uniq" ON "legal_policyAcceptance_bookings_booking" USING btree ("legal_policyAcceptance_id") WHERE "deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "legal_policyAcceptance_bookings_booking_r_idx" ON "legal_policyAcceptance_bookings_booking" USING btree ("bookings_booking_id") WHERE "deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "legal_policy_products_product_pair_idx" ON "legal_policy_products_product" USING btree ("legal_policy_id","products_product_id") WHERE "deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "legal_policy_products_product_l_idx" ON "legal_policy_products_product" USING btree ("legal_policy_id") WHERE "deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "legal_policy_products_product_r_idx" ON "legal_policy_products_product" USING btree ("products_product_id") WHERE "deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "relationships_organization_products_product_pair_idx" ON "relationships_organization_products_product" USING btree ("relationships_organization_id","products_product_id") WHERE "deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "relationships_organization_products_product_l_idx" ON "relationships_organization_products_product" USING btree ("relationships_organization_id") WHERE "deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "relationships_organization_products_product_r_uniq" ON "relationships_organization_products_product" USING btree ("products_product_id") WHERE "deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "relationships_person_products_product_pair_idx" ON "relationships_person_products_product" USING btree ("relationships_person_id","products_product_id") WHERE "deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "relationships_person_products_product_l_idx" ON "relationships_person_products_product" USING btree ("relationships_person_id") WHERE "deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "relationships_person_products_product_r_uniq" ON "relationships_person_products_product" USING btree ("products_product_id") WHERE "deleted_at" IS NULL;