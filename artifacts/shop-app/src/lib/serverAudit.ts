export type ServerAuditAction =
  | "reveal_customer_pii"
  | "reveal_order_pii"
  | "apply_exchange_rate_reference";

export async function recordServerAuditEvent(input: {
  storeId: number;
  action: ServerAuditAction;
  target: string;
  getToken: () => Promise<string | null>;
}): Promise<void> {
  const token = await input.getToken();
  const response = await fetch(`/api/stores/${input.storeId}/audit-events`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ action: input.action, target: input.target }),
  });
  if (!response.ok) {
    throw new Error("操作紀錄寫入失敗，為保護資料本次未執行");
  }
}
