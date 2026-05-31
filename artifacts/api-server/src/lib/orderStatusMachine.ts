import type { OrderStatus } from "@workspace/db";

const TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  pending: ["awaiting_payment", "cancelled"],
  awaiting_payment: ["preparing", "cancelled"],
  preparing: ["shipped", "cancelled"],
  shipped: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
};

export function isValidTransition(from: OrderStatus, to: OrderStatus): boolean {
  return (TRANSITIONS[from] as readonly string[]).includes(to);
}

export function getTransitionError(from: OrderStatus, to: OrderStatus): string {
  if (from === "completed") return "Cannot change status of a completed order";
  if (from === "cancelled") return "Cannot change status of a cancelled order";
  return `Invalid status transition: ${from} → ${to}`;
}
