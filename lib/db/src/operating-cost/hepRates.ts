// 來源：https://www.jprentacar.com/tw/rentacars/hep
// 牌價擷取日：2026-08-10。官方適用範圍 4 ≤ 天數 ≤ 14。
// 本表僅為填表輔助；每趟實付金額以 trips.hep_total_jpy 為準，
// 牌價日後調整不影響任何既有行程。
export const HEP_TOTAL_JPY_BY_DAYS = {
  4: "7700",
  5: "9600",
  6: "11600",
  7: "13500",
  8: "15400",
  9: "17200",
  10: "19300",
  11: "21200",
  12: "23100",
  13: "25000",
  14: "27000",
} as const;

export type HepDays = keyof typeof HEP_TOTAL_JPY_BY_DAYS;

export function resolveHepTotalJpy(days: HepDays): string {
  return HEP_TOTAL_JPY_BY_DAYS[days];
}
