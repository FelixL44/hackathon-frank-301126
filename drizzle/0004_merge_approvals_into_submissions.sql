-- HAC-23: approvals merged into submissions; tasks was never used. Existing approvals are copied over before the drop.
ALTER TABLE "submissions" ADD COLUMN "approved_by" text;--> statement-breakpoint
ALTER TABLE "submissions" ADD COLUMN "payload" jsonb;--> statement-breakpoint
UPDATE "submissions" s SET "approved_by" = a."approved_by", "payload" = a."payload" FROM "approvals" a WHERE a."case_id" = s."case_id" AND a."revision" = s."approved_revision";--> statement-breakpoint
DELETE FROM "submissions" WHERE "payload" IS NULL;--> statement-breakpoint
ALTER TABLE "submissions" ALTER COLUMN "approved_by" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "submissions" ALTER COLUMN "payload" SET NOT NULL;--> statement-breakpoint
DROP TABLE "approvals" CASCADE;--> statement-breakpoint
DROP TABLE "tasks" CASCADE;
