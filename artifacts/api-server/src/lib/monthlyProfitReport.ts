import type {
  OrderProfitSummary,
  ProfitSummaryOrder,
} from "./orderProfitSummary.ts";
import { summarizeOrderProfits } from "./orderProfitSummary.ts";

export const MONTHLY_PROFIT_TIME_ZONE = "Asia/Taipei";

export interface MonthlyProfitReport extends OrderProfitSummary {
  month: string;
  timeZone: typeof MONTHLY_PROFIT_TIME_ZONE;
  orderCount: number;
}

export function parseTaipeiMonthRange(month: string): {
  start: Date;
  end: Date;
} {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) throw new TypeError("month must use YYYY-MM");

  const year = Number(match[1]);
  const monthNumber = Number(match[2]);
  if (year < 2000 || year > 9999 || monthNumber < 1 || monthNumber > 12) {
    throw new RangeError("month is outside the supported range");
  }

  const nextYear = monthNumber === 12 ? year + 1 : year;
  const nextMonth = monthNumber === 12 ? 1 : monthNumber + 1;
  const start = new Date(`${match[1]}-${match[2]}-01T00:00:00+08:00`);
  const end = new Date(
    `${String(nextYear).padStart(4, "0")}-${String(nextMonth).padStart(2, "0")}-01T00:00:00+08:00`,
  );
  return { start, end };
}

export function summarizeMonthlyOrderProfits(
  month: string,
  orders: ProfitSummaryOrder[],
): MonthlyProfitReport {
  return {
    month,
    timeZone: MONTHLY_PROFIT_TIME_ZONE,
    orderCount: orders.length,
    ...summarizeOrderProfits(orders),
  };
}
