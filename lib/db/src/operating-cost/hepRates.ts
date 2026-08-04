export const HEP_TOTAL_JPY_BY_DAYS = {
  4: "7700",
  5: "9600",
  10: "19200",
} as const;

export type HepDays = keyof typeof HEP_TOTAL_JPY_BY_DAYS;

export function resolveHepTotalJpy(days: HepDays): string {
  return HEP_TOTAL_JPY_BY_DAYS[days];
}
