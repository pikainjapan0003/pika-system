import { createHash } from "node:crypto";

export interface PickingOrderInput {
  id: number;
  productId: number;
  productName: string | null;
  specValues: unknown;
  quantity: number;
  items: unknown;
  status: string;
  shippingStatus: string;
}

export interface OrderPickingItemSnapshot {
  orderId: number;
  itemKey: string;
  productName: string;
  specLabel: string | null;
  quantity: number;
  readOnly: boolean;
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, stableValue(nested)]),
    );
  }
  return value;
}

function specLabel(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const entries = Object.entries(value as Record<string, unknown>);
  return entries.length === 0
    ? null
    : entries.map(([key, item]) => `${key}: ${String(item)}`).join("、");
}

function itemKey(
  kind: "single" | "cart",
  index: number,
  productId: number,
  specs: unknown,
): string {
  const digest = createHash("sha256")
    .update(JSON.stringify(stableValue(specs ?? {})))
    .digest("hex");
  return `${kind}:${index}:product:${productId}:spec:${digest}`;
}

export function isPickingReadOnly(order: PickingOrderInput): boolean {
  return (
    order.status === "shipped" ||
    order.status === "completed" ||
    ["shipped", "arrived", "picked_up", "returned"].includes(
      order.shippingStatus,
    )
  );
}

export function buildOrderPickingItems(
  order: PickingOrderInput,
): OrderPickingItemSnapshot[] {
  const readOnly = isPickingReadOnly(order);
  if (Array.isArray(order.items)) {
    return order.items.flatMap((rawItem, index) => {
      if (!rawItem || typeof rawItem !== "object") return [];
      const item = rawItem as Record<string, unknown>;
      const productId = Number(item.productId);
      const quantity = Number(item.quantity);
      if (
        !Number.isSafeInteger(productId) ||
        productId <= 0 ||
        !Number.isSafeInteger(quantity) ||
        quantity <= 0
      ) {
        return [];
      }
      const specs = item.specValues ?? {};
      return [
        {
          orderId: order.id,
          itemKey: itemKey("cart", index, productId, specs),
          productName:
            typeof item.productName === "string" && item.productName
              ? item.productName
              : `Product #${productId}`,
          specLabel: specLabel(specs),
          quantity,
          readOnly,
        },
      ];
    });
  }

  return [
    {
      orderId: order.id,
      itemKey: itemKey("single", 0, order.productId, order.specValues),
      productName: order.productName ?? `Product #${order.productId}`,
      specLabel: specLabel(order.specValues),
      quantity: order.quantity,
      readOnly,
    },
  ];
}
