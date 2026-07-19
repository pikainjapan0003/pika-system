import assert from "node:assert/strict";
import test from "node:test";

import {
  calculateTierProductUnitProfit,
  resolveTierPrice,
} from "./tierPrice.ts";

const prices = {
  generalPrice: "1900",
  vipPrice: "1800",
  wholesalePrice: null,
  partnerPrice: "1500",
};

test("a missing customer tier is locked to the general price", () => {
  assert.deepEqual(resolveTierPrice({ ...prices, customerTier: null }), {
    priceTwd: "1900",
    effectiveTier: "general",
    source: "general",
  });
});

test("an unset tier price falls back to general and never becomes zero", () => {
  assert.deepEqual(resolveTierPrice({ ...prices, customerTier: "wholesale" }), {
    priceTwd: "1900",
    effectiveTier: "wholesale",
    source: "general",
  });
});

test("an explicitly configured zero tier price remains zero instead of falling back", () => {
  assert.equal(
    resolveTierPrice({ ...prices, vipPrice: "0", customerTier: "vip" })
      .priceTwd,
    "0",
  );
});

test("approved VIP and partner prices are selected exactly", () => {
  assert.equal(
    resolveTierPrice({ ...prices, customerTier: "vip" }).priceTwd,
    "1800",
  );
  assert.equal(
    resolveTierPrice({ ...prices, customerTier: "partner" }).priceTwd,
    "1500",
  );
});

test("tier price profit delegates to the existing exact product profit chain", () => {
  const base = {
    ...prices,
    costJpy: "8000",
    storePurchaseExchangeRate: "0.21",
    isTransportCostExempt: true,
    transport: { product: { tripRouteId: null }, route: null, trip: null },
  };

  // Hand-fixed fixtures: 8000 × 0.21 = 1680.
  // General profit: 1900 - 1680 = 220. VIP profit: 1800 - 1680 = 120.
  const general = calculateTierProductUnitProfit({
    ...base,
    customerTier: null,
  });
  const vip = calculateTierProductUnitProfit({ ...base, customerTier: "vip" });
  assert.equal(general.status, "ready");
  assert.equal(vip.status, "ready");
  assert.equal(general.unitProfitTwd.toDecimalPlaces(0), "220");
  assert.equal(vip.unitProfitTwd.toDecimalPlaces(0), "120");
});

test("negative tier prices are rejected before profit calculation", () => {
  assert.throws(
    () => resolveTierPrice({ ...prices, vipPrice: "-1", customerTier: "vip" }),
    /price cannot be negative/,
  );
});
