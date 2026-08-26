CREATE TABLE "approver_changes" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"before_approver_id" integer,
	"after_approver_id" integer NOT NULL,
	"reason" text NOT NULL,
	"changed_by" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "approver_changes" ADD CONSTRAINT "approver_changes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approver_changes" ADD CONSTRAINT "approver_changes_before_approver_id_users_id_fk" FOREIGN KEY ("before_approver_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approver_changes" ADD CONSTRAINT "approver_changes_after_approver_id_users_id_fk" FOREIGN KEY ("after_approver_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approver_changes" ADD CONSTRAINT "approver_changes_changed_by_users_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;