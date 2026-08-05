import { db, pool } from "./index.ts";
import {
  costCategoriesTable,
  FIXED_COST_CATEGORY_SEEDS,
  OPERATING_SETTINGS_SINGLETON_ID,
  operatingSettingsTable,
} from "./schema/index.ts";

export async function seedFixedCostDefaults(): Promise<void> {
  await db
    .insert(costCategoriesTable)
    .values(
      FIXED_COST_CATEGORY_SEEDS.map(([code, name], index) => ({
        code,
        name,
        sortOrder: index + 1,
      })),
    )
    .onConflictDoNothing({ target: costCategoriesTable.code });

  await db
    .insert(operatingSettingsTable)
    .values({ id: OPERATING_SETTINGS_SINGLETON_ID })
    .onConflictDoNothing({ target: operatingSettingsTable.id });
}

try {
  await seedFixedCostDefaults();
  console.log(
    `V1_FIXED_COST_DEFAULTS_SEEDED categories=${FIXED_COST_CATEGORY_SEEDS.length} operating_settings_id=${OPERATING_SETTINGS_SINGLETON_ID}`,
  );
} finally {
  await pool.end();
}
