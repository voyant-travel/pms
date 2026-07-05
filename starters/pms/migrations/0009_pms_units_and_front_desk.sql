CREATE TYPE "public"."pms_stay_ops_status" AS ENUM('expected', 'checked_in', 'checked_out', 'no_show');--> statement-breakpoint
CREATE TYPE "public"."pms_room_unit_status" AS ENUM('available', 'out_of_order', 'out_of_service');--> statement-breakpoint
CREATE TABLE "pms_stay_ops" (
	"id" text PRIMARY KEY NOT NULL,
	"booking_item_id" text NOT NULL,
	"ops_status" "pms_stay_ops_status" DEFAULT 'expected' NOT NULL,
	"checked_in_at" timestamp with time zone,
	"checked_out_at" timestamp with time zone,
	"doc_type" text,
	"doc_number" text,
	"notes" text,
	"checked_in_by" text,
	"checked_out_by" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pms_room_units" (
	"id" text PRIMARY KEY NOT NULL,
	"property_id" text NOT NULL,
	"room_type_id" text NOT NULL,
	"unit_number" text NOT NULL,
	"name" text,
	"floor" text,
	"wing" text,
	"status" "pms_room_unit_status" DEFAULT 'available' NOT NULL,
	"connecting_unit_id" text,
	"notes" text,
	"active" boolean DEFAULT true NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pms_unit_assignments" (
	"id" text PRIMARY KEY NOT NULL,
	"booking_item_id" text NOT NULL,
	"unit_id" text NOT NULL,
	"from_date" date NOT NULL,
	"to_date" date NOT NULL,
	"assigned_by" text,
	"notes" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pms_unit_assignments" ADD CONSTRAINT "pms_unit_assignments_unit_id_pms_room_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."pms_room_units"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_pms_stay_ops_booking_item" ON "pms_stay_ops" USING btree ("booking_item_id");--> statement-breakpoint
CREATE INDEX "idx_pms_stay_ops_status" ON "pms_stay_ops" USING btree ("ops_status");--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_pms_room_units_property_number" ON "pms_room_units" USING btree ("property_id","unit_number");--> statement-breakpoint
CREATE INDEX "idx_pms_room_units_room_type" ON "pms_room_units" USING btree ("room_type_id");--> statement-breakpoint
CREATE INDEX "idx_pms_room_units_property" ON "pms_room_units" USING btree ("property_id");--> statement-breakpoint
CREATE INDEX "idx_pms_unit_assignments_unit_dates" ON "pms_unit_assignments" USING btree ("unit_id","from_date","to_date");--> statement-breakpoint
CREATE INDEX "idx_pms_unit_assignments_booking_item" ON "pms_unit_assignments" USING btree ("booking_item_id");