ALTER TABLE "leave_grants" ADD COLUMN "created_by" integer;--> statement-breakpoint
ALTER TABLE "leave_grants" ADD CONSTRAINT "leave_grants_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "position";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "department";--> statement-breakpoint
UPDATE users SET role = 'SUPER_ADMIN' WHERE role = 'ADMIN';