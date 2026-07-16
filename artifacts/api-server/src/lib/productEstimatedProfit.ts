import type { ProductUnitProfitResult } from "@workspace/db";

export type ProductEstimatedProfitResponse =
  | {
      status: "ready";
      transportStatus: "allocated" | "exempt";
      unitProfitTwd: string;
    }
  | {
      status: "pending_confirmation";
      label: "待確認";
      reason: ProductUnitProfitResult extends infer Result
        ? Result extends {
            status: "pending_confirmation";
            reason: infer Reason;
          }
          ? Reason
          : never
        : never;
    };

export function formatProductEstimatedProfit(
  result: ProductUnitProfitResult,
): ProductEstimatedProfitResponse {
  if (result.status === "pending_confirmation") {
    return {
      status: result.status,
      label: result.label,
      reason: result.reason,
    };
  }

  return {
    status: result.status,
    transportStatus: result.transportStatus,
    unitProfitTwd: result.displayUnitProfitTwd,
  };
}
