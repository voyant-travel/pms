CREATE TYPE "public"."pms_pricing_rule_adjustment" AS ENUM('percent', 'absolute', 'set');--> statement-breakpoint
CREATE TYPE "public"."pms_pricing_rule_kind" AS ENUM('season', 'weekday');--> statement-breakpoint
CREATE TABLE "pms_pricing_rules" (
	"id" text PRIMARY KEY NOT NULL,
	"property_id" text NOT NULL,
	"name" text NOT NULL,
	"kind" "pms_pricing_rule_kind" NOT NULL,
	"from_date" date,
	"to_date" date,
	"weekdays" integer[],
	"adjustment_type" "pms_pricing_rule_adjustment" NOT NULL,
	"adjustment_value" integer NOT NULL,
	"room_type_ids" text[],
	"rate_plan_ids" text[],
	"priority" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pms_rate_base" (
	"id" text PRIMARY KEY NOT NULL,
	"property_id" text NOT NULL,
	"rate_plan_id" text NOT NULL,
	"room_type_id" text NOT NULL,
	"currency" text NOT NULL,
	"base_amount_cents" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_pms_pricing_rules_property_priority" ON "pms_pricing_rules" USING btree ("property_id","priority");--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_pms_rate_base_plan_room" ON "pms_rate_base" USING btree ("rate_plan_id","room_type_id");--> statement-breakpoint
CREATE INDEX "idx_pms_rate_base_property" ON "pms_rate_base" USING btree ("property_id");