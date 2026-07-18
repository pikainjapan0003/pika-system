export async function refreshSkillStateViews(
  refreshSkillMap: () => Promise<void>,
  refreshDailyVisibility: () => Promise<void>,
): Promise<void> {
  await Promise.all([refreshSkillMap(), refreshDailyVisibility()]);
}
