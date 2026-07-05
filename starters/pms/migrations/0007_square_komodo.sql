CREATE TABLE "suppliers_supplier_mice_bid" (
	"id" text PRIMARY KEY NOT NULL,
	"suppliers_supplier_id" text NOT NULL,
	"mice_bid_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE UNIQUE INDEX "suppliers_supplier_mice_bid_pair_idx" ON "suppliers_supplier_mice_bid" USING btree ("suppliers_supplier_id","mice_bid_id") WHERE "deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "suppliers_supplier_mice_bid_l_idx" ON "suppliers_supplier_mice_bid" USING btree ("suppliers_supplier_id") WHERE "deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "suppliers_supplier_mice_bid_r_uniq" ON "suppliers_supplier_mice_bid" USING btree ("mice_bid_id") WHERE "deleted_at" IS NULL;