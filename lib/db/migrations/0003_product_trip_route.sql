ALTER TABLE "products" ADD COLUMN "trip_route_id" integer;
--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_trip_route_id_trip_routes_id_fk" FOREIGN KEY ("trip_route_id") REFERENCES "public"."trip_routes"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "products_trip_route_id_idx" ON "products" USING btree ("trip_route_id");
