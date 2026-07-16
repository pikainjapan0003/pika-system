-- 0008 used DEFAULT now(), which made pre-existing rows look freshly imported.
-- One-time sentinel backfill forces the first post-migration use to show the
-- manual-verification warning; the next real importer run writes its true time.
UPDATE "cvs_stores"
SET "source_updated_at" = '2000-01-01T00:00:00Z';
