-- The schema and importers already expose source_updated_at; this additive
-- migration brings databases created before that field was introduced in sync.
ALTER TABLE "cvs_stores"
  ADD COLUMN IF NOT EXISTS "source_updated_at" timestamp with time zone DEFAULT now() NOT NULL;
