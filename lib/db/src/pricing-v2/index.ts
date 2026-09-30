import { ExactDecimal } from "../transport-cost/index.ts";

export type DecimalValue = string | ExactDecimal | null;
export type PricingV2Input = {
  templateCode?: "GENERAL" | "LIVE" | "PERFUME" | "CUSTOM";
  originalPriceJpy?: DecimalValue;
  effectiveCostJpy?: DecimalValue;
  costAdjustmentRate?: DecimalValue;
  weightGrams?: DecimalValue;
  exchangeRate?: DecimalValue;
  routeCostTwd?: DecimalValue;
  isTransportCostExempt?: boolean;
  internationalShippingRateTwd?: DecimalValue;
  internationalShippingBasisGrams?: DecimalValue;
  lossProtectionTwd?: DecimalValue;
  purchasePaymentFeeRate?: DecimalValue;
  routePaymentFeeRate?: DecimalValue;
  departmentStoreFeeRate?: DecimalValue;
  targetMarginRate?: DecimalValue;
  generalFinalPriceTwd?: DecimalValue;
  vipFinalPriceTwd?: DecimalValue;
  thresholds?: { loss: DecimalValue; low: DecimalValue; medium: DecimalValue };
};
export const PRICING_V2_DEFAULTS = Object.freeze({
  targetMarginRate: "0.35", lossProtectionTwd: "5", purchasePaymentFeeRate: "0.015",
  routePaymentFeeRate: "0.015", generalAdjustmentRate: "1", perfumeAdjustmentRate: "0.915",
  perfumeDepartmentStoreFeeRate: "0.0155",
});
const sub = (a: ExactDecimal, b: ExactDecimal) => a.add(b.multiply(ExactDecimal.from("-1")));
const compare = (a: ExactDecimal, b: ExactDecimal) => a.numerator * b.denominator - b.numerator * a.denominator;
export function decimal(value: DecimalValue | undefined, name: string, signed = false): ExactDecimal | null {
  if (value === undefined || value === null) return null;
  if (!(value instanceof ExactDecimal) && (typeof value !== "string" || value.length > 128 || !/^[+-]?\d+(?:\.\d+)?$/.test(value))) {
    throw new TypeError(`${name} must be a finite decimal string`);
  }
  const result = value instanceof ExactDecimal ? value : ExactDecimal.from(value);
  if (!signed && result.isNegative()) throw new RangeError(`${name} cannot be negative`);
  return result;
}
function required(value: DecimalValue | undefined, name: string, signed = false) {
  const result = decimal(value, name, signed);
  if (result === null) throw new TypeError(`${name} is required`);
  return result;
}
function sale(value: DecimalValue | undefined, name: string) {
  const result = decimal(value, name);
  if (result && (result.equals(ExactDecimal.zero()) || !result.equals(ExactDecimal.from(result.toDecimalPlaces(2))) || compare(result, ExactDecimal.from("99999999.99")) > 0n)) {
    throw new RangeError(`${name} must be positive numeric(10,2)`);
  }
  return result;
}
export function calculatePricing(input: PricingV2Input) {
  const code = input.templateCode ?? "GENERAL";
  if (!["GENERAL", "LIVE", "PERFUME", "CUSTOM"].includes(code)) throw new TypeError("Unknown templateCode");
  const original = decimal(input.originalPriceJpy, "originalPriceJpy");
  const adjustment = required(input.costAdjustmentRate === undefined ? (code === "PERFUME" ? "0.915" : "1") : input.costAdjustmentRate, "costAdjustmentRate");
  const effective = input.effectiveCostJpy === undefined ? original?.multiply(adjustment) ?? null : decimal(input.effectiveCostJpy, "effectiveCostJpy");
  const weight = decimal(input.weightGrams, "weightGrams");
  const exchange = decimal(input.exchangeRate, "exchangeRate");
  const suppliedRoute = decimal(input.routeCostTwd, "routeCostTwd");
  const route = input.isTransportCostExempt ? ExactDecimal.zero() : suppliedRoute;
  const shippingRate = decimal(input.internationalShippingRateTwd, "internationalShippingRateTwd");
  const shippingBasis = decimal(input.internationalShippingBasisGrams, "internationalShippingBasisGrams");
  const loss = required(input.lossProtectionTwd === undefined ? "5" : input.lossProtectionTwd, "lossProtectionTwd");
  const purchaseRate = required(input.purchasePaymentFeeRate === undefined ? "0.015" : input.purchasePaymentFeeRate, "purchasePaymentFeeRate");
  const routeRate = required(input.routePaymentFeeRate === undefined ? "0.015" : input.routePaymentFeeRate, "routePaymentFeeRate");
  const departmentRate = required(input.departmentStoreFeeRate === undefined ? (code === "PERFUME" ? "0.0155" : "0") : input.departmentStoreFeeRate, "departmentStoreFeeRate");
  const margin = required(input.targetMarginRate === undefined ? "0.35" : input.targetMarginRate, "targetMarginRate");
  if (compare(margin, ExactDecimal.from("1")) >= 0n) throw new RangeError("targetMarginRate must be below one");
  for (const [name, value] of [["exchangeRate", exchange], ["internationalShippingBasisGrams", shippingBasis]] as const) {
    if (value?.equals(ExactDecimal.zero())) throw new RangeError(`${name} must be positive`);
  }
  const thresholds = input.thresholds ?? { loss: "25", low: "50", medium: "100" };
  const levels = [required(thresholds.loss, "threshold.loss", true), required(thresholds.low, "threshold.low", true), required(thresholds.medium, "threshold.medium", true)];
  if (compare(levels[0], levels[1]) >= 0n || compare(levels[1], levels[2]) >= 0n) throw new RangeError("Profit thresholds must strictly increase");
  const generalPrice = sale(input.generalFinalPriceTwd, "generalFinalPriceTwd");
  const vipPrice = sale(input.vipFinalPriceTwd, "vipFinalPriceTwd");
  const reasons = Object.entries({ originalPriceJpy: original, effectiveCostJpy: effective, weightGrams: weight, exchangeRate: exchange, routeCostTwd: route, internationalShippingRateTwd: shippingRate, internationalShippingBasisGrams: shippingBasis }).filter(([,v])=>v===null).map(([k])=>`missing_${k}`);
  const originalTwd = original && exchange ? original.multiply(exchange) : null;
  const effectiveTwd = effective && exchange ? effective.multiply(exchange) : null;
  const protectedRoute = route ? route.add(loss) : null;
  const shipping = weight && shippingRate && shippingBasis ? weight.multiply(shippingRate).divide(shippingBasis) : null;
  const purchaseFee = effectiveTwd ? effectiveTwd.multiply(purchaseRate) : null;
  const departmentFee = originalTwd ? originalTwd.multiply(departmentRate) : null;
  const total = effectiveTwd && protectedRoute && shipping && purchaseFee && departmentFee ? effectiveTwd.add(protectedRoute).add(shipping).add(purchaseFee).add(departmentFee) : null;
  const target = total ? total.divide(sub(ExactDecimal.from("1"), margin)) : null;
  const amounts: Record<string, ExactDecimal | null> = {
    originalPriceJpy: original, effectiveCostJpy: effective, weightGrams: weight, exchangeRate: exchange,
    routeCostTwd: route, lossProtectionTwd: loss, protectedRouteCostTwd: protectedRoute,
    internationalShippingRateTwd: shippingRate, internationalShippingBasisGrams: shippingBasis,
    internationalShippingTwd: shipping, purchasePaymentFeeRate: purchaseRate, purchasePaymentFeeTwd: purchaseFee,
    routePaymentFeeRate: routeRate, departmentStoreFeeRate: departmentRate, departmentStoreFeeTwd: departmentFee,
    originalPriceTwd: originalTwd, effectiveProductCostTwd: effectiveTwd, totalCostTwd: total,
    targetMarginRate: margin, targetPriceTwd: target, costAdjustmentRate: adjustment,
  };
  function customer(price: ExactDecimal | null) {
    const pending = [...reasons, ...(price === null ? ["missing_finalPriceTwd"] : [])];
    if (pending.length || !price || !total || !effectiveTwd || !protectedRoute) return { status: "PENDING_CONFIRMATION" as const, reasons: pending, profitLevel: null, values: { finalPriceTwd: price, netProfitTwd: null, profitRate: null, contributionProfitTwd: null, contributionProfitRate: null, perceivedDifferenceTwd: null } };
    const net = sub(price, total);
    const contribution = net.add(protectedRoute);
    const profitLevel = compare(net, levels[0]) <= 0n ? "LOSS" : compare(net, levels[1]) <= 0n ? "LOW" : compare(net, levels[2]) <= 0n ? "MEDIUM" : "HIGH";
    return { status: "READY" as const, reasons: [], profitLevel, values: { finalPriceTwd: price, netProfitTwd: net, profitRate: net.divide(price), contributionProfitTwd: contribution, contributionProfitRate: contribution.divide(price), perceivedDifferenceTwd: sub(price, effectiveTwd) } };
  }
  const general = customer(generalPrice), vip = customer(vipPrice);
  return { status: general.status === "READY" && vip.status === "READY" ? "READY" as const : "PENDING_CONFIRMATION" as const, reasons: [...reasons, ...(generalPrice === null ? ["missing_generalFinalPriceTwd"] : []), ...(vipPrice === null ? ["missing_vipFinalPriceTwd"] : [])], amounts, general, vip, formulaVersion: "v2" };
}
export function serializePricing(result: ReturnType<typeof calculatePricing>) {
  function values(input: Record<string, ExactDecimal | null>, display = false) {
    return Object.fromEntries(Object.entries(input).map(([key,value])=> {
      const scale = display || key === "finalPriceTwd" ? 2 : 12;
      const formatted = value?.toDecimalPlaces(scale) ?? null;
      if (formatted && !display && formatted.replace(/^-/, "").split(".")[0].length > (scale === 2 ? 8 : 18)) throw new RangeError(`${key} exceeds persistence precision`);
      return [key, formatted];
    }));
  }
  return { status: result.status, reasons: result.reasons, formulaVersion: result.formulaVersion,
    amounts: values(result.amounts), display: values(result.amounts, true),
    general: { ...result.general, values: values(result.general.values), display: values(result.general.values, true) },
    vip: { ...result.vip, values: values(result.vip.values), display: values(result.vip.values, true) } };
}
