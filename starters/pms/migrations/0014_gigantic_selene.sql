CREATE TYPE "public"."pms_staff_role" AS ENUM('housekeeper', 'supervisor', 'maintenance', 'front_desk', 'other');--> statement-breakpoint
CREATE TABLE "pms_staff" (
	"id" text PRIMARY KEY NOT NULL,
	"property_id" text,
	"name" text NOT NULL,
	"role" "pms_staff_role" DEFAULT 'housekeeper' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pms_housekeeping_tasks" RENAME COLUMN "assignee_user_id" TO "assignee_staff_id";--> statement-breakpoint
DROP INDEX "idx_pms_housekeeping_tasks_assignee";--> statement-breakpoint
CREATE INDEX "idx_pms_staff_property" ON "pms_staff" USING btree ("property_id");--> statement-breakpoint
CREATE INDEX "idx_pms_staff_active" ON "pms_staff" USING btree ("active");--> statement-breakpoint
CREATE INDEX "idx_pms_housekeeping_tasks_assignee" ON "pms_housekeeping_tasks" USING btree ("assignee_staff_id");