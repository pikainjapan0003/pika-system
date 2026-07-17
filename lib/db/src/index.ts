import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { applyDatabaseSslMode } from "./databaseSslMode.ts";
import * as schema from "./schema/index.ts";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({
  connectionString: applyDatabaseSslMode(
    process.env.DATABASE_URL,
    process.env.DATABASE_SSLMODE,
  ),
});
export const db = drizzle(pool, { schema });

export * from "./schema/index.ts";
export * from "./customers/customerInput.ts";
export * from "./pricing/tierPrice.ts";
export * from "./transport-cost/orderProfitSnapshot.ts";
export * from "./transport-cost/cartOrderProfitSnapshot.ts";
export { multiplyMoneyByQuantity } from "./transport-cost/orderMoney.ts";
