CREATE TABLE "agents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"prompt" text DEFAULT '' NOT NULL,
	"required_fields" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"required_documents" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agents_one_slug" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "agents" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text DEFAULT '' NOT NULL,
	"is_secret" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "cases" ADD COLUMN "agent_id" uuid;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "attachments" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "cases" ADD CONSTRAINT "cases_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- Default claim agents. The admin view can edit or add more; existing rows are never overwritten by a migration.
INSERT INTO "agents" ("slug", "name", "description", "status", "prompt", "required_fields", "required_documents", "sort_order") VALUES
	('motor', 'Motor damage', 'Collision, parking or vandalism damage to a vehicle.', 'active',
	 'Check a motor damage report against the customer message, photos and the workshop estimate. Flag missing documents, unreadable evidence and conflicting parts, dates or plates. Never judge liability or coverage.',
	 '["policyReference","vehicleId","incidentDate","eventDescription","damagedArea"]', '["photo","estimate"]', 1),
	('home-water', 'Home water damage', 'Water damage, leaks and flooding inside a home.', 'active',
	 'Check a home water damage report against the customer description, photos and the repair invoice. Flag missing documents, unreadable evidence and conflicting dates or rooms.',
	 '["policyReference","incidentDate","eventDescription","damagedArea"]', '["photo","invoice"]', 2),
	('personal-injury', 'Personal injury', 'Injuries to the customer or a third party.', 'active',
	 'Check a personal injury report against the description, the incident report and the medical report. Flag missing documents, unreadable evidence and conflicting dates.',
	 '["policyReference","incidentDate","eventDescription","injuredPerson"]', '["medical report","incident report"]', 3)
ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint
-- Demo customers for the customer website (synthetic identities only).
INSERT INTO "customers" ("name", "channel", "address") VALUES
	('Ana Ferreira', 'whatsapp', '+351900000001'),
	('Rui Costa', 'whatsapp', '+351900000002'),
	('Marta Silva', 'web', 'marta.silva@example.com')
ON CONFLICT ("channel", "address") DO NOTHING;
