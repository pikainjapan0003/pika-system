import { ExactDecimal, type DecimalInput } from "../transport-cost/index.ts";
import {
  isMissingDecimal,
  parseNonNegativeDecimal,
  pendingOperatingCost,
  type PendingOperatingCost,
} from "./exact.ts";

export interface FuelCostInput {
  actualFuelJpy?: DecimalInput;
  distanceKm?: DecimalInput;
  fuelPriceJpyPerLiter?: DecimalInput;
  fuelEfficiencyKmPerLiter?: DecimalInput;
}

export interface ReadyFuelCost {
  status: "ready";
  source: "actual" | "estimated";
  fuelJpy: ExactDecimal;
}

export type FuelCostResult = ReadyFuelCost | PendingOperatingCost;

export function calculateFuelCost(input: FuelCostInput): FuelCostResult {
  if (!isMissingDecimal(input.actualFuelJpy)) {
    return {
      status: "ready",
      source: "actual",
      fuelJpy: parseNonNegativeDecimal(input.actualFuelJpy, "actualFuelJpy"),
    };
  }

  if (
    isMissingDecimal(input.distanceKm) ||
    isMissingDecimal(input.fuelPriceJpyPerLiter) ||
    isMissingDecimal(input.fuelEfficiencyKmPerLiter)
  ) {
    return pendingOperatingCost("缺少油資估算資料");
  }

  const distanceKm = parseNonNegativeDecimal(input.distanceKm, "distanceKm");
  const fuelPrice = parseNonNegativeDecimal(
    input.fuelPriceJpyPerLiter,
    "fuelPriceJpyPerLiter",
  );
  const fuelEfficiency = parseNonNegativeDecimal(
    input.fuelEfficiencyKmPerLiter,
    "fuelEfficiencyKmPerLiter",
  );

  if (fuelEfficiency.equals(ExactDecimal.zero())) {
    return pendingOperatingCost("燃油效率不可為 0");
  }

  return {
    status: "ready",
    source: "estimated",
    fuelJpy: distanceKm.multiply(fuelPrice).divide(fuelEfficiency),
  };
}
