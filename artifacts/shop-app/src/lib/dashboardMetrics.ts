export interface DashboardOrderDate {
  createdAt: string | Date;
}

export interface DashboardOrderCounts {
  today: number;
  thisWeek: number;
}

function localStartOfDay(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

/** Counts orders by the owner's local calendar. No monetary values are calculated here. */
export function countDashboardOrders(
  orders: readonly DashboardOrderDate[],
  now = new Date(),
): DashboardOrderCounts {
  const todayStart = localStartOfDay(now);
  const tomorrowStart = new Date(todayStart);
  tomorrowStart.setDate(tomorrowStart.getDate() + 1);
  const weekStart = new Date(todayStart);
  const mondayOffset = (todayStart.getDay() + 6) % 7;
  weekStart.setDate(weekStart.getDate() - mondayOffset);

  let today = 0;
  let thisWeek = 0;
  for (const order of orders) {
    const createdAt = new Date(order.createdAt);
    if (!Number.isFinite(createdAt.getTime())) continue;
    if (createdAt >= weekStart && createdAt < tomorrowStart) thisWeek += 1;
    if (createdAt >= todayStart && createdAt < tomorrowStart) today += 1;
  }
  return { today, thisWeek };
}
