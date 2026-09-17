import assert from "node:assert/strict";
import { test } from "node:test";
import { calculateAreaDomesticCost } from "./areaDomesticCost.ts";
import { resolveProductTransportCost } from "./productTransportCost.ts";
import { calculateProductUnitProfit } from "./productUnitProfit.ts";

function fixture() {
  return {
    product: { tripRouteId: 5 },
    trip: { id: 2, exchangeRate: "0.2", hepTotalJpy: "500", totalItemQuantity: 100 },
    route: {
      id: 5, tripId: 2, tripAreaId: 12, estQty: 20,
      etcJpy: "100", trainJpy: "200", fuelJpy: "300", parkingJpy: "400",
      fee1_5PctIsOverridden: false, totalJpyIsOverridden: false,
      domesticPerItemIsOverridden: false, transportPerItemIsOverridden: false,
      finalCostPerItemIsOverridden: false,
    },
    area: { id: 12, tripId: 2 },
    areaCost: {
      tripAreaId: 12, mode: "ESTIMATE", cardboardUnitJpy: "100",
      shippingUnitJpy: "400", parcelCount: 2, estimatedItemQuantity: 100,
    },
  };
}

test("legacy Route oracle keeps area, HEP and trip FX separate from purchase FX", () => {
  const transport = fixture();
  const area = calculateAreaDomesticCost({ ...transport.areaCost, exchangeRate: "0.2" });
  assert.equal(area.status, "ready");
  // (100 + 400) * 1.015 * 2 * .2 / 100 = 2.03 TWD per item.
  assert.equal(area.fee1_5Pct.toDecimalPlaces(12), "7.500000000000");
  assert.equal(area.totalTwd.toDecimalPlaces(12), "203.000000000000");
  assert.equal(area.unitDomesticTwd.toDecimalPlaces(12), "2.030000000000");
  const route = resolveProductTransportCost(transport);
  assert.equal(route.status, "ready");
  // 1000 * 1.015 / 20 * .2 + 2.03 + 500 / 100 * .2 = 13.18.
  assert.equal(route.finalCostPerItem.toDecimalPlaces(12), "13.180000000000");
  const profit = calculateProductUnitProfit({
    unitPriceTwd: "300", costJpy: "1000", storePurchaseExchangeRate: "0.21",
    isTransportCostExempt: false, transport,
  });
  assert.equal(profit.status, "ready");
  assert.equal(profit.productCostTwd.toDecimalPlaces(12), "210.000000000000");
  assert.equal(profit.unitProfitTwd.toDecimalPlaces(12), "76.820000000000");
});

test("legacy incomplete Route stays pending instead of silently becoming zero", () => {
  for (const [section, key, reason] of [
    ["route", "fuelJpy", "missing_fuel_jpy"],
    ["trip", "exchangeRate", "missing_exchange_rate"],
    ["trip", "totalItemQuantity", "missing_hep_item_quantity"],
  ]) {
    const input = fixture();
    input[section][key] = null;
    const result = resolveProductTransportCost(input);
    assert.equal(result.status, "pending_confirmation", key);
    assert.equal(result.reason, reason, key);
    assert.equal(result.label, "待確認");
  }
});

test("legacy exemption bypasses Route allocation but requires purchase cost", () => {
  const input = {
    unitPriceTwd: "300", costJpy: "1000", storePurchaseExchangeRate: "0.21",
    isTransportCostExempt: true,
    transport: { product: { tripRouteId: null }, route: null, trip: null },
  };
  const result = calculateProductUnitProfit(input);
  assert.equal(result.status, "ready");
  assert.equal(result.transportStatus, "exempt");
  assert.equal(result.unitTransportCostTwd.toDecimalPlaces(12), "0.000000000000");
  assert.equal(result.unitProfitTwd.toDecimalPlaces(12), "90.000000000000");
  assert.deepEqual(calculateProductUnitProfit({ ...input, costJpy: null }), {
    status: "pending_confirmation", label: "待確認", reason: "missing_product_cost_jpy",
  });
});
