CREATE TABLE "customers" (
  "id" serial PRIMARY KEY NOT NULL,
  "store_id" integer NOT NULL,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "phone" text NOT NULL,
  "cvs_store_id" text,
  "cvs_store_name" text,
  "cvs_store_address" text,
  "cvs_store_phone" text,
  "notes" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "customers" ADD CONSTRAINT "customers_store_id_stores_id_fk"
  FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade;

CREATE INDEX "customers_store_id_idx" ON "customers" USING btree ("store_id");
CREATE UNIQUE INDEX "customers_store_code_unique" ON "customers" USING btree ("store_id", "code");
