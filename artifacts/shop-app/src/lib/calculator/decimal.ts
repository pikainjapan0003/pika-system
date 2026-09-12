import Decimal from "decimal.js";
import { PERCENT_SCALE, ROUNDING_UNITS } from "./constants";

// Isolated working precision; neither display rounding nor global Decimal settings.
export const D = Decimal.clone({
  precision: 50,
  rounding: Decimal.ROUND_HALF_UP,
  toExpNeg: -100,
  toExpPos: 100,
});
export type Amount = Decimal;
export const ceil1 = (value: Amount) => value.ceil();
export const ceil5 = (value: Amount) =>
  value.div(ROUNDING_UNITS.five).ceil().mul(ROUNDING_UNITS.five);
export const exact = (value: Amount) => value.toFixed();
export const money = (value: Amount) => value.toFixed(2);
export const rate = (value: Amount) => value.toFixed(4);
export const percent = (value: Amount) =>
  value.mul(PERCENT_SCALE).toFixed(2) + "%";
