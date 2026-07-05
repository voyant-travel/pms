CREATE TABLE "accommodations_roomBlock_mice_roomingAssignment" (
	"id" text PRIMARY KEY NOT NULL,
	"accommodations_roomBlock_id" text NOT NULL,
	"mice_roomingAssignment_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "bookings_booking_mice_delegate" (
	"id" text PRIMARY KEY NOT NULL,
	"bookings_booking_id" text NOT NULL,
	"mice_delegate_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "relationships_person_mice_delegate" (
	"id" text PRIMARY KEY NOT NULL,
	"relationships_person_id" text NOT NULL,
	"mice_delegate_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE UNIQUE INDEX "accommodations_roomBlock_mice_roomingAssignment_pair_idx" ON "accommodations_roomBlock_mice_roomingAssignment" USING btree ("accommodations_roomBlock_id","mice_roomingAssignment_id") WHERE "deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "accommodations_roomBlock_mice_roomingAssignment_l_idx" ON "accommodations_roomBlock_mice_roomingAssignment" USING btree ("accommodations_roomBlock_id") WHERE "deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "accommodations_roomBlock_mice_roomingAssignment_r_uniq" ON "accommodations_roomBlock_mice_roomingAssignment" USING btree ("mice_roomingAssignment_id") WHERE "deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "bookings_booking_mice_delegate_pair_idx" ON "bookings_booking_mice_delegate" USING btree ("bookings_booking_id","mice_delegate_id") WHERE "deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "bookings_booking_mice_delegate_l_uniq" ON "bookings_booking_mice_delegate" USING btree ("bookings_booking_id") WHERE "deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "bookings_booking_mice_delegate_r_uniq" ON "bookings_booking_mice_delegate" USING btree ("mice_delegate_id") WHERE "deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "relationships_person_mice_delegate_pair_idx" ON "relationships_person_mice_delegate" USING btree ("relationships_person_id","mice_delegate_id") WHERE "deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "relationships_person_mice_delegate_l_idx" ON "relationships_person_mice_delegate" USING btree ("relationships_person_id") WHERE "deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "relationships_person_mice_delegate_r_uniq" ON "relationships_person_mice_delegate" USING btree ("mice_delegate_id") WHERE "deleted_at" IS NULL;