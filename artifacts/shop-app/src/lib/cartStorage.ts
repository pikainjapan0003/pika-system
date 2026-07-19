export interface BuyerCartItem {
  itemKey: string;
  shareToken: string;
  productId: number;
  productName: string;
  productImageUrl?: string | null;
  unitPrice: number;
  quantity: number;
  specValues: Record<string, string>;
  shippingCvsEnabled?: boolean;
  shippingBlackCatEnabled?: boolean;
  shippingPostOfficeEnabled?: boolean;
  shippingSelfPickupEnabled?: boolean;
}

const CART_KEY = "buyer-cart";

export function getCart(): BuyerCartItem[] {
  try {
    const raw = localStorage.getItem(CART_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as BuyerCartItem[];
  } catch {
    return [];
  }
}

export function saveCart(items: BuyerCartItem[]): void {
  try {
    localStorage.setItem(CART_KEY, JSON.stringify(items));
  } catch {}
}

export function makeItemKey(
  shareToken: string,
  specValues: Record<string, string>,
): string {
  const sorted = Object.entries(specValues).sort(([a], [b]) =>
    a.localeCompare(b),
  );
  return `${shareToken}:${JSON.stringify(sorted)}`;
}

export function addToCart(params: {
  shareToken: string;
  productId: number;
  productName: string;
  productImageUrl?: string | null;
  unitPrice: number;
  quantity: number;
  specValues: Record<string, string>;
  shippingCvsEnabled?: boolean;
  shippingBlackCatEnabled?: boolean;
  shippingPostOfficeEnabled?: boolean;
  shippingSelfPickupEnabled?: boolean;
}): BuyerCartItem[] {
  const itemKey = makeItemKey(params.shareToken, params.specValues);
  const cart = getCart();
  const existing = cart.find((i) => i.itemKey === itemKey);
  let newCart: BuyerCartItem[];
  if (existing) {
    newCart = cart.map((i) =>
      i.itemKey === itemKey
        ? { ...i, quantity: i.quantity + params.quantity }
        : i,
    );
  } else {
    newCart = [...cart, { ...params, itemKey }];
  }
  saveCart(newCart);
  return newCart;
}

export function updateCartQty(
  itemKey: string,
  quantity: number,
): BuyerCartItem[] {
  const cart = getCart().map((i) =>
    i.itemKey === itemKey ? { ...i, quantity } : i,
  );
  saveCart(cart);
  return cart;
}

export function removeFromCart(itemKey: string): BuyerCartItem[] {
  const cart = getCart().filter((i) => i.itemKey !== itemKey);
  saveCart(cart);
  return cart;
}

export function clearCart(): void {
  try {
    localStorage.removeItem(CART_KEY);
  } catch {}
}

export function cartTotalQty(cart: BuyerCartItem[]): number {
  return cart.reduce((sum, i) => sum + i.quantity, 0);
}
