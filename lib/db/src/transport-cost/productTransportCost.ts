import { PENDING_CONFIRMATION_LABEL, calculateTransportCost } from "./index.ts";
import type {
  DecimalInput,
  PendingTransportCost,
  QuantityInput,
  ReadyTransportCost,
} from "./index.ts";
import {
  calculateAreaDomesticCost,
  type PendingAreaDomesticCost,
} from "./areaDomesticCost.ts";

export interface ProductTransportReference {
  tripRouteId: number | null | undefined;
}

export interface ProductTransportRouteInput {
  id: number;
  tripId: number;
  tripAreaId: number | null | undefined;
  estQty: QuantityInput;
  trainJpy?: DecimalInput;
  fuelJpy?: DecimalInput;
  parkingJpy?: DecimalInput;
  etcJpy?: DecimalInput;
  cardboardJpy?: DecimalInput;
  shippingJpy?: DecimalInput;
  fee1_5PctOverride?: DecimalInput;
  fee1_5PctIsOverridden: boolean;
  totalJpyOverride?: DecimalInput;
  totalJpyIsOverridden: boolean;
  domesticPerItemOverride?: DecimalInput;
  domesticPerItemIsOverridden: boolean;
  transportPerItemOverride?: DecimalInput;
  transportPerItemIsOverridden: boolean;
  finalCostPerItemOverride?: DecimalInput;
  finalCostPerItemIsOverridden: boolean;
}

export interface ProductTransportAreaInput {
  id: number;
  tripId: number;
}

export interface ProductTransportAreaCostInput {
  tripAreaId: number;
  mode: "ESTIMATE" | "ACTUAL";
  cardboardUnitJpy: DecimalInput;
  shippingUnitJpy: DecimalInput;
  parcelCount: QuantityInput;
  estimatedItemQuantity: QuantityInput;
}

export interface ProductTransportTripInput {
  id: number;
  exchangeRate: DecimalInput;
  hepTotalJpy?: DecimalInput;
  totalItemQuantity?: QuantityInput;
}

export interface ResolveProductTransportCostInput {
  product: ProductTransportReference;
  route: ProductTransportRouteInput | null | undefined;
  trip: ProductTransportTripInput | null | undefined;
  area?: ProductTransportAreaInput | null;
  areaCost?: ProductTransportAreaCostInput | null;
}

export interface PendingProductTransportCost {
  status: "pending_confirmation";
  label: typeof PENDING_CONFIRMATION_LABEL;
  reason:
    | "missing_trip_route_attachment"
    | "missing_trip_route"
    | "missing_trip"
    | "missing_trip_area"
    | "missing_trip_area_cost";
}

export type ProductTransportCostResult =
  | ReadyTransportCost
  | PendingTransportCost
  | PendingAreaDomesticCost
  | PendingProductTransportCost;

function pending(
  reason: PendingProductTransportCost["reason"],
): PendingProductTransportCost {
  return {
    status: "pending_confirmation",
    label: PENDING_CONFIRMATION_LABEL,
    reason,
  };
}

function calculateRouteTransportCost(
  route: ProductTransportRouteInput,
  trip: ProductTransportTripInput,
  areaUnitDomesticTwd: ReadyTransportCost["areaUnitDomesticTwd"] | null,
): ReadyTransportCost | PendingTransportCost {
  return calculateTransportCost({
    estQty: route.estQty,
    exchangeRate: trip.exchangeRate,
    hepTotalJpy: trip.hepTotalJpy,
    totalItemQuantity: trip.totalItemQuantity,
    trainJpy: route.trainJpy,
    fuelJpy: route.fuelJpy,
    parkingJpy: route.parkingJpy,
    etcJpy: route.etcJpy,
    areaUnitDomesticTwd,
    overrides: {
      fee1_5Pct: {
        isOverridden: route.fee1_5PctIsOverridden,
        value: route.fee1_5PctOverride,
      },
      totalJpy: {
        isOverridden: route.totalJpyIsOverridden,
        value: route.totalJpyOverride,
      },
      domesticPerItem: {
        isOverridden: route.domesticPerItemIsOverridden,
        value: route.domesticPerItemOverride,
      },
      transportPerItem: {
        isOverridden: route.transportPerItemIsOverridden,
        value: route.transportPerItemOverride,
      },
      finalCostPerItem: {
        isOverridden: route.finalCostPerItemIsOverridden,
        value: route.finalCostPerItemOverride,
      },
    },
  });
}

/**
 * Resolves a product's current route cost without copying or caching the result.
 * Owner decision Q61: the exchange rate comes only from the route's parent trip.
 */
export function resolveProductTransportCost(
  input: ResolveProductTransportCostInput,
): ProductTransportCostResult {
  const tripRouteId = input.product.tripRouteId;
  if (tripRouteId === null || tripRouteId === undefined) {
    return pending("missing_trip_route_attachment");
  }

  const route = input.route;
  if (!route || route.id !== tripRouteId) {
    return pending("missing_trip_route");
  }

  const trip = input.trip;
  if (!trip || trip.id !== route.tripId) {
    return pending("missing_trip");
  }

  const tripAreaId = route.tripAreaId;
  const area = input.area;
  if (
    tripAreaId === null ||
    tripAreaId === undefined ||
    !area ||
    area.id !== tripAreaId ||
    area.tripId !== route.tripId
  ) {
    return calculateRouteTransportCost(route, trip, null);
  }

  const areaCost = input.areaCost;
  if (
    !areaCost ||
    areaCost.tripAreaId !== area.id ||
    areaCost.mode !== "ESTIMATE"
  ) {
    return pending("missing_trip_area_cost");
  }

  const domesticCost = calculateAreaDomesticCost({
    cardboardUnitJpy: areaCost.cardboardUnitJpy,
    shippingUnitJpy: areaCost.shippingUnitJpy,
    parcelCount: areaCost.parcelCount,
    estimatedItemQuantity: areaCost.estimatedItemQuantity,
    exchangeRate: trip.exchangeRate,
  });
  if (domesticCost.status === "pending_confirmation") {
    return domesticCost;
  }

  return calculateRouteTransportCost(route, trip, domesticCost.unitDomesticTwd);
}
