import type { OrderStatus } from "@workspace/db";

export const STATUS_LABELS: Record<OrderStatus, string> & Record<string, string> = {
  pending: "待確認",
  awaiting_payment: "待付款",
  preparing: "備貨中",
  shipped: "已出貨",
  completed: "已完成",
  cancelled: "已取消",
};

export const STATUS_COLORS: Record<OrderStatus, string> & Record<string, string> = {
  pending: "bg-amber-100 text-amber-700",
  awaiting_payment: "bg-blue-100 text-blue-700",
  preparing: "bg-purple-100 text-purple-700",
  shipped: "bg-cyan-100 text-cyan-700",
  completed: "bg-green-100 text-green-700",
  cancelled: "bg-gray-100 text-gray-500",
};

export const ALL_STATUSES = Object.keys(STATUS_LABELS) as OrderStatus[];

// Active flow order (excluding cancelled)
export const STATUS_STEPS = [
  "pending",
  "awaiting_payment",
  "preparing",
  "shipped",
  "completed",
] as const;

// Admin override: every status can be manually switched to any other status
// — mirrors backend orderStatusMachine.ts (Step 8C: terminal states are no
// longer dead ends; admins can restore completed/cancelled orders).
export const VALID_NEXT_STATUSES: Record<OrderStatus, OrderStatus[]> =
  Object.fromEntries(
    ALL_STATUSES.map((s) => [s, ALL_STATUSES.filter((other) => other !== s)]),
  ) as Record<OrderStatus, OrderStatus[]>;
