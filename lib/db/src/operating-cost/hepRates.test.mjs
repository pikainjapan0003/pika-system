import assert from "node:assert/strict";
import test from "node:test";

import { HEP_TOTAL_JPY_BY_DAYS, resolveHepTotalJpy } from "./hepRates.ts";

test("HEP day options preserve the approved JPY totals", () => {
  assert.deepEqual(HEP_TOTAL_JPY_BY_DAYS, {
    4: "7700",
    5: "9600",
    6: "11600",
    7: "13500",
    8: "15400",
    9: "17200",
    10: "19300",
    11: "21200",
    12: "23100",
    13: "25000",
    14: "27000",
  });
  for (const [days, expectedTotal] of Object.entries({
    4: "7700",
    5: "9600",
    6: "11600",
    7: "13500",
    8: "15400",
    9: "17200",
    10: "19300",
    11: "21200",
    12: "23100",
    13: "25000",
    14: "27000",
  })) {
    assert.equal(resolveHepTotalJpy(Number(days)), expectedTotal);
  }
  assert.equal(resolveHepTotalJpy(10), "19300");
});
