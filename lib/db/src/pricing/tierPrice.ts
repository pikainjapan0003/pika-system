import { ExactDecimal } from "../transport-cost/index.ts";
import type { DecimalInput } from "../transport-cost/index.ts";
import {
  calculateProductUnitProfit,
} from "../transport-cost/productUnitProfit.ts";
import type {
  CalculateProductUnitProfitInput,
  ProductUnitProfitResult,
} from "../transport-cost/productUnitProfit.ts";
import type { CustomerTier } from "../schema/customers.ts";

export interface TierPriceInput {
  generalPrice: Exclude<DecimalInput, null | undefined>;
  vipPrice?: DecimalInput;
  wholesalePrice?: DecimalInput;
  partnerPrice?: DecimalInput;
  customerTier?: CustomerTier | null;
}

export interface ResolvedTierPrice {
  priceTwd: string;
  effectiveTier: CustomerTier;
  source: "general" | "tier";
}

function isMissing(value: DecimalInput): value is null | undefined | "" {
  return value === null
    || value === undefined
    || (typeof value === "string" && value.trim() === "");
}

function exactPriceString(value: Exclude<DecimalInput, null | undefined>): string {
  const normalized = typeof value === "bigint" ? value.toString() : value.trim();
  const parsed = ExactDecimal.from(normalized);
  if (parsed.isNegative()) throw new RangeError("price cannot be negative");
  return normalized;
}

export function resolveTierPrice(input: TierPriceInput): ResolvedTierPrice {
  const effectiveTier = input.customerTier ?? "general";
  const tierCandidate = effectiveTier === "vip"
    ? input.vipPrice
    : effectiveTier === "wholesale"
      ? input.wholesalePrice
      : effectiveTier === "partner"
        ? input.partnerPrice
        : undefined;
  const usesTierPrice = effectiveTier !== "general" && !isMissing(tierCandidate);
  const selected = usesTierPrice ? tierCandidate : input.generalPrice;
  return {
    priceTwd: exactPriceString(selected as Exclude<DecimalInput, null | undefined>),
    effectiveTier,
    source: usesTierPrice ? "tier" : "general",
  };
}

export type CalculateTierProductUnitProfitInput = TierPriceInput & Omit<
  CalculateProductUnitProfitInput,
  "unitPriceTwd"
>;

/** Resolves the approved tier price, then delegates every cost/profit formula. */
export function calculateTierProductUnitProfit(
  input: CalculateTierProductUnitProfitInput,
): ProductUnitProfitResult {
  const price = resolveTierPrice(input);
  return calculateProductUnitProfit({
    unitPriceTwd: price.priceTwd,
    costJpy: input.costJpy,
    storePurchaseExchangeRate: input.storePurchaseExchangeRate,
    isTransportCostExempt: input.isTransportCostExempt,
    transport: input.transport,
  });
}
