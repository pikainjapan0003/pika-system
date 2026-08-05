CREATE TABLE "cost_categories" (
  "id" serial PRIMARY KEY NOT NULL,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "sort_order" integer NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "cost_categories_code_unique" UNIQUE("code")
);

INSERT INTO "cost_categories" ("code", "name", "sort_order") VALUES
  ('PERSONNEL', '人事費用', 1),
  ('MARKETING', '行銷費用', 2),
  ('MEALS', '伙食費用', 3),
  ('FLIGHT', '機票費用', 4),
  ('LODGING', '住宿費用', 5),
  ('LOCKER', '置物櫃費用', 6),
  ('CAR_RENTAL', '租車租金', 7),
  ('SIM', '網卡費用', 8),
  ('THEME_PARK', '樂園門票費用', 9),
  ('AIRPORT_TRANSFER', '接機費用', 10),
  ('OTHER', '其他', 11)
ON CONFLICT ("code") DO NOTHING;
