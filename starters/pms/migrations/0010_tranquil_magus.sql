CREATE TYPE "public"."pms_housekeeping_task_source" AS ENUM('auto', 'manual');--> statement-breakpoint
CREATE TYPE "public"."pms_housekeeping_task_status" AS ENUM('open', 'in_progress', 'done', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."pms_housekeeping_task_type" AS ENUM('clean', 'inspect', 'turndown', 'deep_clean');--> statement-breakpoint
CREATE TYPE "public"."pms_maintenance_reason" AS ENUM('maintenance', 'renovation', 'deep_clean', 'other');--> statement-breakpoint
CREATE TYPE "public"."pms_maintenance_status" AS ENUM('active', 'resolved', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."pms_unit_room_status" AS ENUM('dirty', 'clean', 'inspected');--> statement-breakpoint
CREATE TABLE "pms_housekeeping_tasks" (
	"id" text PRIMARY KEY NOT NULL,
	"unit_id" text NOT NULL,
	"property_id" text NOT NULL,
	"type" "pms_housekeeping_task_type" DEFAULT 'clean' NOT NULL,
	"status" "pms_housekeeping_task_status" DEFAULT 'open' NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"assignee_user_id" text,
	"due_date" date,
	"source" "pms_housekeeping_task_source" DEFAULT 'manual' NOT NULL,
	"source_key" text,
	"notes" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pms_maintenance_blocks" (
	"id" text PRIMARY KEY NOT NULL,
	"unit_id" text NOT NULL,
	"property_id" text NOT NULL,
	"from_date" date NOT NULL,
	"to_date" date NOT NULL,
	"reason" "pms_maintenance_reason" DEFAULT 'maintenance' NOT NULL,
	"description" text,
	"status" "pms_maintenance_status" DEFAULT 'active' NOT NULL,
	"created_by" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pms_unit_room_status" (
	"id" text PRIMARY KEY NOT NULL,
	"unit_id" text NOT NULL,
	"room_status" "pms_unit_room_status" DEFAULT 'dirty' NOT NULL,
	"last_changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_changed_by" text
);
--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_pms_housekeeping_tasks_source_key" ON "pms_housekeeping_tasks" USING btree ("source_key");--> statement-breakpoint
CREATE INDEX "idx_pms_housekeeping_tasks_property_due" ON "pms_housekeeping_tasks" USING btree ("property_id","due_date");--> statement-breakpoint
CREATE INDEX "idx_pms_housekeeping_tasks_unit" ON "pms_housekeeping_tasks" USING btree ("unit_id");--> statement-breakpoint
CREATE INDEX "idx_pms_housekeeping_tasks_status" ON "pms_housekeeping_tasks" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_pms_housekeeping_tasks_assignee" ON "pms_housekeeping_tasks" USING btree ("assignee_user_id");--> statement-breakpoint
CREATE INDEX "idx_pms_maintenance_blocks_unit_dates" ON "pms_maintenance_blocks" USING btree ("unit_id","from_date","to_date");--> statement-breakpoint
CREATE INDEX "idx_pms_maintenance_blocks_property" ON "pms_maintenance_blocks" USING btree ("property_id");--> statement-breakpoint
CREATE INDEX "idx_pms_maintenance_blocks_status" ON "pms_maintenance_blocks" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_pms_unit_room_status_unit" ON "pms_unit_room_status" USING btree ("unit_id");