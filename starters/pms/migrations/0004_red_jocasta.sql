CREATE TABLE "operations_functionSpace_mice_session" (
	"id" text PRIMARY KEY NOT NULL,
	"operations_functionSpace_id" text NOT NULL,
	"mice_session_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE UNIQUE INDEX "operations_functionSpace_mice_session_pair_idx" ON "operations_functionSpace_mice_session" USING btree ("operations_functionSpace_id","mice_session_id") WHERE "deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "operations_functionSpace_mice_session_l_idx" ON "operations_functionSpace_mice_session" USING btree ("operations_functionSpace_id") WHERE "deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "operations_functionSpace_mice_session_r_uniq" ON "operations_functionSpace_mice_session" USING btree ("mice_session_id") WHERE "deleted_at" IS NULL;