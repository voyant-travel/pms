CREATE TYPE "public"."pms_folio_kind" AS ENUM('stay', 'house');--> statement-breakpoint
CREATE TYPE "public"."pms_folio_posting_source" AS ENUM('night_audit', 'manual', 'transfer', 'payment_sync');--> statement-breakpoint
CREATE TYPE "public"."pms_folio_posting_type" AS ENUM('room', 'tax', 'fee', 'extra', 'payment', 'adjustment', 'transfer');--> statement-breakpoint
CREATE TYPE "public"."pms_folio_status" AS ENUM('open', 'settled', 'closed', 'voided');--> statement-breakpoint
CREATE TABLE "pms_business_dates" (
	"id" text PRIMARY KEY NOT NULL,
	"property_id" text NOT NULL,
	"current_date" date NOT NULL,
	"last_audit_run_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pms_folio_postings" (
	"id" text PRIMARY KEY NOT NULL,
	"folio_id" text NOT NULL,
	"business_date" date NOT NULL,
	"type" "pms_folio_posting_type" NOT NULL,
	"description" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"currency" text NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"unit_amount_cents" integer,
	"source" "pms_folio_posting_source" DEFAULT 'manual' NOT NULL,
	"source_key" text,
	"reversal_of_id" text,
	"created_by" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pms_folios" (
	"id" text PRIMARY KEY NOT NULL,
	"folio_number" text NOT NULL,
	"property_id" text NOT NULL,
	"kind" "pms_folio_kind" DEFAULT 'stay' NOT NULL,
	"booking_id" text,
	"booking_item_id" text,
	"guest_name" text,
	"currency" text NOT NULL,
	"status" "pms_folio_status" DEFAULT 'open' NOT NULL,
	"finance_invoice_id" text,
	"settled_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pms_folio_postings" ADD CONSTRAINT "pms_folio_postings_folio_id_pms_folios_id_fk" FOREIGN KEY ("folio_id") REFERENCES "public"."pms_folios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_pms_business_dates_property" ON "pms_business_dates" USING btree ("property_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_pms_folio_postings_source_key" ON "pms_folio_postings" USING btree ("source_key");--> statement-breakpoint
CREATE INDEX "idx_pms_folio_postings_folio_date" ON "pms_folio_postings" USING btree ("folio_id","business_date");--> statement-breakpoint
CREATE INDEX "idx_pms_folio_postings_reversal_of" ON "pms_folio_postings" USING btree ("reversal_of_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_pms_folios_property_number" ON "pms_folios" USING btree ("property_id","folio_number");--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_pms_folios_stay_booking_item" ON "pms_folios" USING btree ("booking_item_id") WHERE "pms_folios"."kind" = 'stay';--> statement-breakpoint
CREATE INDEX "idx_pms_folios_property_status" ON "pms_folios" USING btree ("property_id","status");--> statement-breakpoint
CREATE INDEX "idx_pms_folios_booking" ON "pms_folios" USING btree ("booking_id");