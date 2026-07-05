CREATE TABLE "mice_program_operations_spaceBlock" (
	"id" text PRIMARY KEY NOT NULL,
	"mice_program_id" text NOT NULL,
	"operations_spaceBlock_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE UNIQUE INDEX "mice_program_operations_spaceBlock_pair_idx" ON "mice_program_operations_spaceBlock" USING btree ("mice_program_id","operations_spaceBlock_id") WHERE "deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "mice_program_operations_spaceBlock_l_idx" ON "mice_program_operations_spaceBlock" USING btree ("mice_program_id") WHERE "deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "mice_program_operations_spaceBlock_r_uniq" ON "mice_program_operations_spaceBlock" USING btree ("operations_spaceBlock_id") WHERE "deleted_at" IS NULL;