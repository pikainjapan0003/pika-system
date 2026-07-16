// Suggested thresholds from T-06; the owner may adjust them later.
export const CVS_STORE_POSSIBLY_STALE_DAYS = 35;
export const CVS_STORE_VERIFY_FIRST_DAYS = 60;

export type CvsStoreFreshness =
  | { level: "fresh"; label: null }
  | { level: "possibly_stale"; label: "資料可能過期" }
  | { level: "verify_first"; label: "請先人工核對" };

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

export function getCvsStoreFreshness(
  sourceUpdatedAt: string | null,
  now: Date = new Date(),
): CvsStoreFreshness {
  if (!sourceUpdatedAt) {
    return { level: "verify_first", label: "請先人工核對" };
  }

  const updatedAt = new Date(sourceUpdatedAt);
  if (Number.isNaN(updatedAt.getTime())) {
    return { level: "verify_first", label: "請先人工核對" };
  }

  const ageDays =
    Math.max(0, now.getTime() - updatedAt.getTime()) / MILLISECONDS_PER_DAY;
  if (ageDays > CVS_STORE_VERIFY_FIRST_DAYS) {
    return { level: "verify_first", label: "請先人工核對" };
  }
  if (ageDays > CVS_STORE_POSSIBLY_STALE_DAYS) {
    return { level: "possibly_stale", label: "資料可能過期" };
  }
  return { level: "fresh", label: null };
}
