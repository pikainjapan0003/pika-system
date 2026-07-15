import {
  PENDING_CONFIRMATION_LABEL,
  calculateTransportCost,
} from "./index.ts";
import type {
  DecimalInput,
  PendingTransportCost,
  QuantityInput,
  ReadyTransportCost,
} from "./index.ts";

export interface ProductTransportReference {
  tripRouteId: number | null | undefined;
}

export interface ProductTransportRouteInput {
  id: number;
  tripId: number;
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

export interface ProductTransportTripInput {
  id: number;
  exchangeRate: DecimalInput;
}

export interface ResolveProductTransportCostInput {
  product: ProductTransportReference;
  route: ProductTransportRouteInput | null | undefined;
  trip: ProductTransportTripInput | null | undefined;
}

export interface PendingProductTransportCost {
  status: "pending_confirmation";
  label: typeof PENDING_CONFIRMATION_LABEL;
  reason: "missing_trip_route_attachment" | "missing_trip_route" | "missing_trip";
}

export type ProductTransportCostResult =
  | ReadyTransportCost
  | PendingTransportCost
  | PendingProductTransportCost;

function pending(reason: PendingProductTransportCost["reason"]): PendingProductTransportCost {
  return {
    status: "pending_confirmation",
    label: PENDING_CONFIRMATION_LABEL,
    reason,
  };
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

  return calculateTransportCost({
    estQty: route.estQty,
    exchangeRate: trip.exchangeRate,
    trainJpy: route.trainJpy,
    fuelJpy: route.fuelJpy,
    parkingJpy: route.parkingJpy,
    etcJpy: route.etcJpy,
    cardboardJpy: route.cardboardJpy,
    shippingJpy: route.shippingJpy,
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
