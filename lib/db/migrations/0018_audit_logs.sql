CREATE TABLE "audit_logs" (
  "id" serial PRIMARY KEY NOT NULL,
  "store_id" integer NOT NULL,
  "actor" text NOT NULL,
  "action" text NOT NULL,
  "target" text NOT NULL,
  "at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "audit_logs_actor_non_empty" CHECK (char_length("actor") BETWEEN 1 AND 200),
  CONSTRAINT "audit_logs_action_non_empty" CHECK (char_length("action") BETWEEN 1 AND 100),
  CONSTRAINT "audit_logs_target_non_empty" CHECK (char_length("target") BETWEEN 1 AND 200)
);

ALTER TABLE "audit_logs"
  ADD CONSTRAINT "audit_logs_store_id_stores_id_fk"
  FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id")
  ON DELETE cascade ON UPDATE no action;

CREATE INDEX "audit_logs_store_at_idx" ON "audit_logs" USING btree ("store_id", "at");
