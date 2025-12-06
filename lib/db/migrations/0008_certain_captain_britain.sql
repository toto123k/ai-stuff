DO $$ BEGIN
 CREATE TYPE "public"."object_type" AS ENUM('file', 'folder');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."perm_type" AS ENUM('read', 'write', 'admin');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."root_type" AS ENUM('personal', 'organizational');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "fs_objects" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"type" "object_type" NOT NULL,
	"path" "ltree" NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "fs_roots" (
	"id" serial PRIMARY KEY NOT NULL,
	"root_folder_id" integer NOT NULL,
	"owner_id" uuid NOT NULL,
	"type" "root_type" NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_permissions" (
	"user_id" uuid NOT NULL,
	"folder_id" integer NOT NULL,
	"permission" "perm_type" NOT NULL,
	CONSTRAINT "user_permissions_user_id_folder_id_pk" PRIMARY KEY("user_id","folder_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "fs_roots" ADD CONSTRAINT "fs_roots_root_folder_id_fs_objects_id_fk" FOREIGN KEY ("root_folder_id") REFERENCES "public"."fs_objects"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "fs_roots" ADD CONSTRAINT "fs_roots_owner_id_User_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."User"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_permissions" ADD CONSTRAINT "user_permissions_user_id_User_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."User"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_permissions" ADD CONSTRAINT "user_permissions_folder_id_fs_objects_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."fs_objects"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "path_gist_idx" ON "fs_objects" USING gist ("path");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fs_roots_owner_type_idx" ON "fs_roots" USING btree ("owner_id","type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_permissions_user_idx" ON "user_permissions" USING btree ("user_id");