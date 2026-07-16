import { ExactDecimal } from "./index.ts";

export type MoneyQuantityInput = string | number | bigint;

/**
 * Multiplies an order unit price by its integer quantity without passing
 * through an IEEE-754 Number. Order money columns are numeric(10,2), so the
 * result is rendered at the column's two-decimal scale before persistence.
 */
export function multiplyMoneyByQuantity(
  unitPrice: string,
  quantity: MoneyQuantityInput,
): string {
  return ExactDecimal
    .from(unitPrice)
    .multiply(ExactDecimal.from(String(quantity)))
    .toDecimalPlaces(2);
}
