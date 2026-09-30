import { useEffect, useRef } from "react";

type ListingRequestToken = { context: string; epoch: number; channel?: string; request?: number };

/** A selection/context owns its async work. Superseded replies may finish but cannot publish. */
export function useListingRequestScope(context: string) {
  const state = useRef({ context, epoch: 0, alive: true, sequence: 0, requests: new Map<string, number>() });
  if (state.current.context !== context) {
    state.current.context = context;
    state.current.epoch++;
    state.current.requests.clear();
  }
  useEffect(() => {
    state.current.alive = true;
    return () => { state.current.alive = false; state.current.epoch++; state.current.requests.clear(); };
  }, []);
  const capture = (): ListingRequestToken => ({ context: state.current.context, epoch: state.current.epoch });
  return {
    epoch: state.current.epoch,
    capture,
    invalidate: () => { state.current.epoch++; state.current.requests.clear(); },
    begin: (channel: string): ListingRequestToken => {
      const request = ++state.current.sequence;
      state.current.requests.set(channel, request);
      return { ...capture(), channel, request };
    },
    current: (token: ListingRequestToken) => state.current.alive && token.context === state.current.context
      && token.epoch === state.current.epoch
      && (!token.channel || state.current.requests.get(token.channel) === token.request),
  };
}

/** Only explicit user actions mark a field; hydration and Catalog loads do not. */
export function useListingDirtyFields() {
  const fields = useRef(new Set<string>());
  return {
    mark: (field: string) => { fields.current.add(field); },
    has: (field: string) => fields.current.has(field),
    reset: () => fields.current.clear(),
  };
}

/** Keep the focused control inside the usable area below the sticky form header. */
export function focusListingControl(node: HTMLElement | null, form: HTMLFormElement | null) {
  if (!node) return;
  node.focus({ preventScroll: true });
  const headerBottom = form?.querySelector("header")?.getBoundingClientRect().bottom ?? 0;
  const top = Math.max(12, headerBottom + 12);
  const rect = node.getBoundingClientRect();
  if (rect.top < top || rect.bottom > window.innerHeight - 16) {
    window.scrollBy({ top: rect.top - top, behavior: "instant" });
  }
}

export function listingErrorFields(error: any): string[] | undefined {
  const labels: Record<string, string> = {
    name: "商品名稱", originalPriceJpy: "日本原始售價 JPY", effectiveCostJpy: "實際計價成本 JPY",
    weightGrams: "重量 g", generalFinalPriceTwd: "一般售價", vipFinalPriceTwd: "VIP 售價",
    wholesalePrice: "批發售價", partnerPrice: "夥伴售價", templateId: "計價模板",
    shippingProfileId: "國際運費方案", departmentStoreFeeRate: "百貨手續費率（空白使用模板）",
    tripRouteId: "行程路線", listingBarcode: "上架條碼（不等於 SKU）", imageUrl: "圖片網址",
  };
  const details = error?.data?.details;
  const keys: string[] = Array.isArray(details) ? details.map(issue => String(issue.path?.[0] ?? ""))
    : (details?.reasons ?? []).map((reason: string) => reason.replace(/^missing_/, ""));
  const fields = [...new Set(keys.map(key => labels[key]).filter(Boolean))];
  return fields.length ? fields : undefined;
}
