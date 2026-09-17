import { and, eq } from "drizzle-orm";
import { db, storesTable, pricingTemplatesTable, internationalShippingProfilesTable, storePricingSettingsTable, tripRoutesTable, tripsTable, tripAreasTable, tripAreaCostsTable } from "@workspace/db";
import { calculatePricing, serializePricing, decimal } from "@workspace/db/pricing-v2";
import { resolveProductTransportCost } from "../../../../lib/db/src/transport-cost/productTransportCost.ts";
import { PreviewPricingV2Body } from "@workspace/api-zod";

export class PricingResolutionError extends Error { readonly status = 404; }
export type PricingExecutor = Pick<typeof db, "select">;
/** Caller supplies its transaction; this resolver never opens or commits one. */
export async function resolvePricing(executor: PricingExecutor, storeId: number, input: ReturnType<typeof PreviewPricingV2Body.parse>, captureContext?: (context: Record<string,unknown>)=>void) {
    const [store] = await executor.select().from(storesTable).where(eq(storesTable.id, storeId));
    const [settings] = await executor.select().from(storePricingSettingsTable).where(eq(storePricingSettingsTable.storeId, storeId));
    const [template] = input.templateId === undefined ? [] : await executor.select().from(pricingTemplatesTable).where(and(eq(pricingTemplatesTable.id, input.templateId), eq(pricingTemplatesTable.storeId, storeId), eq(pricingTemplatesTable.isActive, true)));
    if (input.templateId !== undefined && !template) throw new PricingResolutionError("Template not found");
    const shippingId = input.shippingProfileId ?? template?.defaultShippingProfileId;
    const [shipping] = shippingId == null ? [] : await executor.select().from(internationalShippingProfilesTable).where(and(eq(internationalShippingProfilesTable.id, shippingId), eq(internationalShippingProfilesTable.storeId, storeId), eq(internationalShippingProfilesTable.isActive, true)));
    if (shippingId != null && !shipping) throw new PricingResolutionError("Shipping profile not found");
    const routeRate = input.routePaymentFeeRate ?? settings?.routePaymentFeeRate ?? "0.015";
    decimal(routeRate, "routePaymentFeeRate");
    let routeCost = null;
    let routeMetadata: Record<string, unknown> = { status: input.isTransportCostExempt ? "EXEMPT" : "PENDING_CONFIRMATION", paymentFeeRate: routeRate };
    if (input.tripRouteId !== undefined) {
      const [route] = await executor.select().from(tripRoutesTable).where(and(eq(tripRoutesTable.id, input.tripRouteId), eq(tripRoutesTable.storeId, storeId)));
      if (!route) throw new PricingResolutionError("Route not found");
      const [trip] = await executor.select().from(tripsTable).where(and(eq(tripsTable.id, route.tripId), eq(tripsTable.storeId, storeId)));
      if (!trip) throw new PricingResolutionError("Trip not found");
      const [area] = route.tripAreaId == null ? [] : await executor.select().from(tripAreasTable).where(and(eq(tripAreasTable.id, route.tripAreaId), eq(tripAreasTable.tripId, trip.id), eq(tripAreasTable.storeId, storeId)));
      if (route.tripAreaId != null && !area) throw new PricingResolutionError("Route area not found");
      const [areaCost] = area === undefined ? [] : await executor.select().from(tripAreaCostsTable).where(and(eq(tripAreaCostsTable.tripAreaId, area.id), eq(tripAreaCostsTable.mode, "ESTIMATE")));
      if (!input.isTransportCostExempt && trip.exchangeRate !== null && decimal(trip.exchangeRate, "tripExchangeRate")?.numerator === 0n) throw new RangeError("Trip exchange rate must be positive");
      const resolved = resolveProductTransportCost({ product: { tripRouteId: route.id }, route, trip, area, areaCost, paymentFeeRate: routeRate });
      if (resolved.status === "ready") routeCost = resolved.finalCostPerItem;
      routeMetadata = {
        status: input.isTransportCostExempt ? "EXEMPT" : resolved.status, routeId: route.id, tripId: trip.id, areaId: area?.id ?? null,
        paymentFeeRate: routeRate, tripExchangeRate: trip.exchangeRate,
        inputs: { route, trip: { exchangeRate: trip.exchangeRate, hepTotalJpy: trip.hepTotalJpy, totalItemQuantity: trip.totalItemQuantity }, areaCost: areaCost ?? null },
        components: resolved.status === "ready" ? { routeFeeJpy: resolved.fee1_5Pct.toDecimalPlaces(12), transportPerItemJpy: resolved.transportPerItem.toDecimalPlaces(12), areaUnitDomesticTwd: resolved.areaUnitDomesticTwd.toDecimalPlaces(12), hepPerItemTwd: resolved.hepPerItemTwd.toDecimalPlaces(12), finalCostPerItemTwd: resolved.finalCostPerItem.toDecimalPlaces(12) } : { reason: resolved.reason },
      };
    }
    const code = template?.code ?? input.templateCode ?? "GENERAL";
    if (!["GENERAL", "LIVE", "PERFUME", "CUSTOM"].includes(code)) throw new TypeError("Invalid template code");
    const result = calculatePricing({ ...input, templateCode: code as "GENERAL" | "LIVE" | "PERFUME" | "CUSTOM",
      effectiveCostJpy: input.effectiveCostJpy === undefined && template?.costAdjustmentMode === "MANUAL" ? null : input.effectiveCostJpy,
      costAdjustmentRate: input.costAdjustmentRate ?? template?.costAdjustmentRate,
      departmentStoreFeeRate: input.departmentStoreFeeRate ?? template?.departmentStoreFeeRate,
      exchangeRate: input.exchangeRate === undefined ? store?.purchaseExchangeRate : input.exchangeRate,
      routeCostTwd: routeCost, routePaymentFeeRate: routeRate,
      internationalShippingRateTwd: shipping?.rateTwd, internationalShippingBasisGrams: shipping?.basisWeightGrams,
      lossProtectionTwd: input.lossProtectionTwd ?? settings?.lossProtectionTwd,
      purchasePaymentFeeRate: input.purchasePaymentFeeRate ?? settings?.purchasePaymentFeeRate,
      targetMarginRate: input.targetMarginRate ?? settings?.targetMarginRate,
      thresholds: input.thresholds ?? (settings ? { loss: settings.profitLossMaxTwd, low: settings.profitLowMaxTwd, medium: settings.profitMediumMaxTwd } : undefined),
    });
    captureContext?.({storePurchaseExchangeRate:store?.purchaseExchangeRate??null,settings:settings??null,template:template??null,shipping:shipping??null,thresholds:input.thresholds??(settings?{loss:settings.profitLossMaxTwd,low:settings.profitLowMaxTwd,medium:settings.profitMediumMaxTwd}:null),usesFormulaDefaultThresholds:input.thresholds===undefined&&!settings});
    return { ...serializePricing(result), settingsVersion: settings?.settingsVersion ?? "v1", templateId: template?.id ?? null,
      shippingProfile: shipping ?? null, routeMetadata };
}
