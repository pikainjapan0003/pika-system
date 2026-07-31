import { ExactDecimal } from "@workspace/db/transport-cost";
import {
  prepareStoreCreditAdjustment,
  prepareStoreCreditGrant,
} from "@workspace/db/store-credit";

export type OwnerStoreCreditMutationType = "grant" | "adjust";

export interface StoreCreditBalancePreview {
  before: ExactDecimal;
  after: ExactDecimal;
}

/**
 * Display-only preview. The API revalidates the same mutation under a
 * per-customer database lock before it appends the immutable ledger row.
 */
export function previewStoreCreditBalance(input: {
  balance: string;
  type: OwnerStoreCreditMutationType;
  amount: string;
}): StoreCreditBalancePreview {
  const before = ExactDecimal.from(input.balance);
  const prepared =
    input.type === "grant"
      ? prepareStoreCreditGrant(input.amount)
      : prepareStoreCreditAdjustment({
          amount: input.amount,
          availableBalance: input.balance,
        });
  const signedAmount =
    prepared.direction === "credit"
      ? prepared.amount
      : prepared.amount.multiply(ExactDecimal.from("-1"));
  return {
    before,
    after: before.add(signedAmount),
  };
}
