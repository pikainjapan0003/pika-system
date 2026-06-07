import type { OrderStatus } from "@workspace/db";

// Step 8C: admins can manually switch an order to any other valid status —
// completed/cancelled are no longer dead ends and can be restored.
const VALID_STATUSES: readonly OrderStatus[] = [
  "pending",
  "awaiting_payment",
  "preparing",
  "shipped",
  "completed",
  "cancelled",
];

export function isValidTransition(from: OrderStatus, to: OrderStatus): boolean {
  return (VALID_STATUSES as readonly string[]).includes(to) && to !== from;
}

export function getTransitionError(from: OrderStatus, to: OrderStatus): string {
  if (!(VALID_STATUSES as readonly string[]).includes(to)) {
    return `Invalid order status: ${to}`;
  }
  return `Order is already in status: ${from}`;
}
