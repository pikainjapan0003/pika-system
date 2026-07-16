ALTER TABLE "orders" ADD COLUMN "payment_last5" text;

ALTER TABLE "orders" ADD CONSTRAINT "orders_payment_last5_length"
  CHECK ("payment_last5" IS NULL OR char_length("payment_last5") = 5);
