import {
  DEFAULT_REFERENCE_DAILY_WAGE,
  OPERATING_SETTINGS_SINGLETON_ID,
} from "../schema/operatingSettings.ts";
import { ExactDecimal } from "../transport-cost/index.ts";

export {
  DEFAULT_REFERENCE_DAILY_WAGE,
  OPERATING_SETTINGS_SINGLETON_ID,
  PAYMENT_FEE_RATE,
} from "../schema/operatingSettings.ts";

export interface OperatingSettingsRecord {
  id: number;
  reference_daily_wage: string;
  updated_at: Date;
}

export interface OperatingSettingsQueryResult {
  rows: OperatingSettingsRecord[];
}

export interface OperatingSettingsQueryable {
  query(
    sql: string,
    values?: readonly unknown[],
  ): Promise<OperatingSettingsQueryResult>;
}

export interface ResolvedOperatingSettings {
  id: typeof OPERATING_SETTINGS_SINGLETON_ID;
  referenceDailyWage: string;
  updatedAt: Date | null;
}

function normalizeDailyWage(value: string): string {
  const wage = ExactDecimal.from(value);
  if (wage.isNegative()) {
    throw new RangeError("referenceDailyWage must be non-negative");
  }
  return wage.toDecimalPlaces(12);
}

export async function readOperatingSettings(
  queryable: OperatingSettingsQueryable,
): Promise<ResolvedOperatingSettings> {
  const result = await queryable.query(
    `SELECT id, reference_daily_wage, updated_at
       FROM operating_settings
      WHERE id = $1
      LIMIT 1`,
    [OPERATING_SETTINGS_SINGLETON_ID],
  );
  const row = result.rows[0];
  return {
    id: OPERATING_SETTINGS_SINGLETON_ID,
    referenceDailyWage:
      row?.reference_daily_wage ?? DEFAULT_REFERENCE_DAILY_WAGE,
    updatedAt: row?.updated_at ?? null,
  };
}

export async function writeOperatingSettings(
  queryable: OperatingSettingsQueryable,
  referenceDailyWage: string,
): Promise<ResolvedOperatingSettings> {
  const normalizedWage = normalizeDailyWage(referenceDailyWage);
  const result = await queryable.query(
    `INSERT INTO operating_settings (id, reference_daily_wage, updated_at)
     VALUES ($1, $2, now())
     ON CONFLICT (id) DO UPDATE
       SET reference_daily_wage = EXCLUDED.reference_daily_wage,
           updated_at = now()
     RETURNING id, reference_daily_wage, updated_at`,
    [OPERATING_SETTINGS_SINGLETON_ID, normalizedWage],
  );
  const row = result.rows[0];
  if (!row) {
    throw new Error("operating settings write did not return a row");
  }
  return {
    id: OPERATING_SETTINGS_SINGLETON_ID,
    referenceDailyWage: row.reference_daily_wage,
    updatedAt: row.updated_at,
  };
}
