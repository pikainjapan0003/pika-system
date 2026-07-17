export interface AutomationFoundationCapabilities {
  auditLogTable: unknown;
  trackingWorkerRunner: unknown;
}

/**
 * The automation foundation exists only when both reviewed building blocks are
 * present: the audit-log table mapping and the report-only tracking worker.
 * This is a deployment capability fact, not a per-store enablement decision.
 */
export function deriveAutomationFoundationFact(
  capabilities: AutomationFoundationCapabilities,
): boolean {
  const table = capabilities.auditLogTable;
  const hasAuditLogColumns =
    typeof table === "object" &&
    table !== null &&
    "storeId" in table &&
    "actor" in table &&
    "action" in table &&
    "target" in table;

  return (
    hasAuditLogColumns &&
    typeof capabilities.trackingWorkerRunner === "function"
  );
}
