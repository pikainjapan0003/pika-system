import assert from "node:assert/strict";
import test from "node:test";

import { HEP_TOTAL_JPY_BY_DAYS, resolveHepTotalJpy } from "./hepRates.ts";

test("HEP day options preserve the approved JPY totals", () => {
  assert.deepEqual(HEP_TOTAL_JPY_BY_DAYS, {
    4: "7700",
    5: "9600",
    10: "19200",
  });
  assert.equal(resolveHepTotalJpy(4), "7700");
  assert.equal(resolveHepTotalJpy(5), "9600");
  assert.equal(resolveHepTotalJpy(10), "19200");
});
