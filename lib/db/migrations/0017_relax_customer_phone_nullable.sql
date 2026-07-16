-- Some customers only provide a LINE identity. Missing phone is stored as NULL,
-- never as an invented placeholder value.
ALTER TABLE "customers" ALTER COLUMN "phone" DROP NOT NULL;
