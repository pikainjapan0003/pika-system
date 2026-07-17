CREATE TABLE "store_skill_states" (
  "store_id" integer NOT NULL,
  "skill_key" text NOT NULL,
  "enabled" boolean DEFAULT false NOT NULL,
  "enabled_at" timestamp with time zone,
  "enabled_by" text,
  "catalog_version" integer DEFAULT 1 NOT NULL,
  "source" text DEFAULT 'manual' NOT NULL,
  "disabled_at" timestamp with time zone,
  CONSTRAINT "store_skill_states_store_id_skill_key_pk" PRIMARY KEY("store_id", "skill_key"),
  CONSTRAINT "store_skill_states_source_valid" CHECK ("source" IN ('manual', 'package', 'onboarding')),
  CONSTRAINT "store_skill_states_catalog_version_positive" CHECK ("catalog_version" > 0),
  CONSTRAINT "store_skill_states_enabled_shape" CHECK (("enabled" = false) OR ("enabled_at" IS NOT NULL AND "enabled_by" IS NOT NULL))
);

ALTER TABLE "store_skill_states"
  ADD CONSTRAINT "store_skill_states_store_id_stores_id_fk"
  FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id")
  ON DELETE cascade ON UPDATE no action;

CREATE INDEX "store_skill_states_store_enabled_idx"
  ON "store_skill_states" USING btree ("store_id", "enabled");
