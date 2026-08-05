CREATE TABLE "operating_settings" (
  "id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
  "reference_daily_wage" numeric(30, 12) DEFAULT '1500' NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "operating_settings_singleton_id" CHECK ("operating_settings"."id" = 1),
  CONSTRAINT "operating_settings_daily_wage_non_negative" CHECK ("operating_settings"."reference_daily_wage" >= 0)
);

INSERT INTO "operating_settings" ("id", "reference_daily_wage")
VALUES (1, '1500')
ON CONFLICT ("id") DO NOTHING;
