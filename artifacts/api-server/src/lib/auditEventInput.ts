export const CLIENT_AUDIT_ACTIONS = [
  "reveal_customer_pii",
  "reveal_order_pii",
  "apply_exchange_rate_reference",
] as const;

export type ClientAuditAction = (typeof CLIENT_AUDIT_ACTIONS)[number];

const ACTION_SET = new Set<string>(CLIENT_AUDIT_ACTIONS);
const SAFE_TARGET = /^[a-z][a-z0-9_-]*(?::[a-z0-9_-]+)?$/i;

export function parseClientAuditEvent(value: unknown): {
  action: ClientAuditAction;
  target: string;
} {
  if (!value || typeof value !== "object") {
    throw new TypeError("Audit event body is required");
  }
  const action = String((value as { action?: unknown }).action ?? "").trim();
  const target = String((value as { target?: unknown }).target ?? "").trim();
  if (!ACTION_SET.has(action)) {
    throw new TypeError("Audit action is not allowed");
  }
  if (!SAFE_TARGET.test(target) || target.length > 200) {
    throw new TypeError("Audit target must be a safe opaque identifier");
  }
  return { action: action as ClientAuditAction, target };
}
