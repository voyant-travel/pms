CREATE TYPE "public"."pms_channel_ari_event_status" AS ENUM('pending', 'pushed', 'failed', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."pms_channel_reservation_status" AS ENUM('received', 'ingested', 'failed', 'ignored');--> statement-breakpoint
CREATE TABLE "pms_channel_ari_events" (
	"id" text PRIMARY KEY NOT NULL,
	"channel" text NOT NULL,
	"property_id" text NOT NULL,
	"room_type_id" text NOT NULL,
	"rate_plan_id" text,
	"payload" jsonb NOT NULL,
	"status" "pms_channel_ari_event_status" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"dedupe_key" text NOT NULL,
	"pushed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pms_channel_reservations" (
	"id" text PRIMARY KEY NOT NULL,
	"channel" text NOT NULL,
	"channel_reservation_id" text NOT NULL,
	"status" "pms_channel_reservation_status" DEFAULT 'received' NOT NULL,
	"payload" jsonb NOT NULL,
	"booking_id" text,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_pms_channel_ari_events_dedupe" ON "pms_channel_ari_events" USING btree ("dedupe_key");--> statement-breakpoint
CREATE INDEX "idx_pms_channel_ari_events_channel_status" ON "pms_channel_ari_events" USING btree ("channel","status");--> statement-breakpoint
CREATE INDEX "idx_pms_channel_ari_events_property" ON "pms_channel_ari_events" USING btree ("property_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_pms_channel_reservations_channel_ref" ON "pms_channel_reservations" USING btree ("channel","channel_reservation_id");--> statement-breakpoint
CREATE INDEX "idx_pms_channel_reservations_channel_status" ON "pms_channel_reservations" USING btree ("channel","status");--> statement-breakpoint
CREATE INDEX "idx_pms_channel_reservations_booking" ON "pms_channel_reservations" USING btree ("booking_id");