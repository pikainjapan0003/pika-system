ALTER TABLE "products" ADD COLUMN "storage_temp_class" text;

ALTER TABLE "products"
ADD CONSTRAINT "products_storage_temp_class_valid"
CHECK (
  "storage_temp_class" IS NULL
  OR "storage_temp_class" IN ('normal', 'frozen')
);
