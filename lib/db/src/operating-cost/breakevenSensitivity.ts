import {
  ExactDecimal,
  type DecimalInput,
  type QuantityInput,
} from "../transport-cost/index.ts";
import { calculateBreakeven } from "./breakeven.ts";
import type { BreakevenInput, ReadyBreakeven } from "./breakeven.ts";
import { pendingOperatingCost, type PendingOperatingCost } from "./exact.ts";

/** Safety bound for one sweep axis; the API route validates the same limit. */
export const SENSITIVITY_GRID_AXIS_MAX = 20;

function subtract(left: ExactDecimal, right: ExactDecimal): ExactDecimal {
  return left.add(right.multiply(ExactDecimal.from("-1")));
}

function parseSensitivityQuantity(value: QuantityInput): ExactDecimal {
  if (value === null || value === undefined || value === "") {
    throw new TypeError("sensitivity quantity requires a value");
  }
  let integer: bigint;
  if (typeof value === "bigint") {
    integer = value;
  } else if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) {
      throw new TypeError("sensitivity quantity must be a safe integer");
    }
    integer = BigInt(value);
  } else if (/^\d{1,15}$/.test(value.trim())) {
    integer = BigInt(value.trim());
  } else {
    throw new TypeError("sensitivity quantity must be a positive integer");
  }
  if (integer <= 0n) {
    throw new TypeError("sensitivity quantity must be a positive integer");
  }
  return ExactDecimal.from(integer);
}

function parseSensitivityUnitGrossProfit(value: DecimalInput): ExactDecimal {
  if (value === null || value === undefined || value === "") {
    throw new TypeError("sensitivity unit gross profit requires a value");
  }
  if (typeof value === "bigint") {
    return ExactDecimal.from(value);
  }
  const normalized = String(value).trim();
  if (!/^\d+(?:\.\d+)?$/.test(normalized)) {
    throw new TypeError(
      "sensitivity unit gross profit must be a non-negative decimal",
    );
  }
  const parsed = ExactDecimal.from(normalized);
  if (parsed.isNegative()) {
    throw new TypeError(
      "sensitivity unit gross profit must be a non-negative decimal",
    );
  }
  return parsed;
}

export interface BreakevenSensitivityInput extends BreakevenInput {
  /** Row sweep: item quantities sold in the period (positive integers). */
  quantities: readonly QuantityInput[];
  /** Column sweep: unit gross profits in TWD (non-negative decimals). */
  unitGrossProfits: readonly DecimalInput[];
}

export interface ReadyBreakevenSensitivityMatrix {
  status: "ready";
  /** From calculateBreakeven: fixed + variable + payment fee minus rebate. */
  netCostToRecoverTwd: ExactDecimal;
  breakevenQuantity: bigint;
  salaryTargetQuantity: bigint;
  /** Quantity rows echoed as exact integer strings. */
  rows: string[];
  /** Unit gross profit columns echoed as exact decimal strings. */
  columns: string[];
  /**
   * cells[row][col] = unitGrossProfit(col) * quantity(row) - netCostToRecoverTwd.
   * This is the exact inverse identity of the breakeven quantity defined by
   * calculateBreakeven (breakevenQuantity = ceil(netCostToRecover / unitGP));
   * it introduces no new business formula. Negative cells are loss cells.
   */
  cells: string[][];
}

export type BreakevenSensitivityResult =
  | ReadyBreakevenSensitivityMatrix
  | PendingOperatingCost;

/**
 * Wires the existing calculateBreakeven into a quantity x unit-gross-profit
 * sensitivity matrix. Any missing breakeven input fails closed through
 * calculateBreakeven's own pending result — never a silent zero.
 */
export function calculateBreakevenSensitivity(
  input: BreakevenSensitivityInput,
): BreakevenSensitivityResult {
  if (
    input.quantities.length === 0 ||
    input.unitGrossProfits.length === 0 ||
    input.quantities.length > SENSITIVITY_GRID_AXIS_MAX ||
    input.unitGrossProfits.length > SENSITIVITY_GRID_AXIS_MAX
  ) {
    return pendingOperatingCost("缺少敏感度矩陣範圍");
  }

  const breakeven: ReadyBreakeven | PendingOperatingCost =
    calculateBreakeven(input);
  if (breakeven.status !== "ready") {
    return breakeven;
  }

  const rows = input.quantities.map((quantity) => {
    const parsed = parseSensitivityQuantity(quantity);
    if (parsed.denominator !== 1n) {
      throw new TypeError("sensitivity quantity must be an integer");
    }
    return parsed;
  });
  const columns = input.unitGrossProfits.map((value) =>
    parseSensitivityUnitGrossProfit(value),
  );

  const cells = rows.map((quantity) =>
    columns.map((unitGrossProfit) =>
      subtract(
        unitGrossProfit.multiply(quantity),
        breakeven.netCostToRecoverTwd,
      ).toDecimalPlaces(12),
    ),
  );

  return {
    status: "ready",
    netCostToRecoverTwd: breakeven.netCostToRecoverTwd,
    breakevenQuantity: breakeven.breakevenQuantity,
    salaryTargetQuantity: breakeven.salaryTargetQuantity,
    rows: rows.map((quantity) => quantity.toFractionString().split("/")[0]),
    columns: columns.map((value) => value.toDecimalPlaces(0)),
    cells,
  };
}
