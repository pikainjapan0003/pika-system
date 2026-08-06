import { db, pool } from "./index.ts";
import {
  costCategoriesTable,
  FIXED_COST_CATEGORY_SEEDS,
  OPERATING_SETTINGS_SINGLETON_ID,
  operatingSettingsTable,
  PURCHASE_COST_CATEGORY_SEEDS,
  VARIABLE_COST_CATEGORY_SEEDS,
} from "./schema/index.ts";

export async function seedFixedCostDefaults(): Promise<void> {
  await db
    .insert(costCategoriesTable)
    .values([
      ...FIXED_COST_CATEGORY_SEEDS.map(([code, name], index) => ({
        code,
        name,
        kind: "FIXED" as const,
        sortOrder: index + 1,
      })),
      ...VARIABLE_COST_CATEGORY_SEEDS.map(([code, name], index) => ({
        code,
        name,
        kind: "VARIABLE" as const,
        sortOrder: FIXED_COST_CATEGORY_SEEDS.length + index + 1,
      })),
      ...PURCHASE_COST_CATEGORY_SEEDS.map(([code, name], index) => ({
        code,
        name,
        kind: "PURCHASE" as const,
        sortOrder:
          FIXED_COST_CATEGORY_SEEDS.length +
          VARIABLE_COST_CATEGORY_SEEDS.length +
          index +
          1,
      })),
    ])
    .onConflictDoNothing({ target: costCategoriesTable.code });

  await db
    .insert(operatingSettingsTable)
    .values({ id: OPERATING_SETTINGS_SINGLETON_ID })
    .onConflictDoNothing({ target: operatingSettingsTable.id });
}

try {
  await seedFixedCostDefaults();
  const countResult = await pool.query<{
    fixed: number;
    variable: number;
    purchase: number;
    total: number;
    singleton: number;
  }>(`
    SELECT
      count(*) FILTER (WHERE kind = 'FIXED')::int AS fixed,
      count(*) FILTER (WHERE kind = 'VARIABLE')::int AS variable,
      count(*) FILTER (WHERE kind = 'PURCHASE')::int AS purchase,
      count(*)::int AS total,
      (SELECT count(*)::int FROM operating_settings WHERE id = 1) AS singleton
    FROM cost_categories
  `);
  const counts = countResult.rows[0];
  console.log(
    `V1_COST_DEFAULTS_SEEDED fixed=${counts.fixed} variable=${counts.variable} purchase=${counts.purchase} total=${counts.total} operating_settings_id_1=${counts.singleton}`,
  );
} finally {
  await pool.end();
}
