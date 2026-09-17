import { useCallback, useState, useRef } from "react";
import { useAuth } from "@clerk/react";
import {
  catalogList,
  catalogSettingsGet,
  listTrips,
  type CatalogProduct,
} from "@workspace/api-client-react";
import {
  useCatalogQuery,
  useDebounced,
  control,
  action,
  Money,
} from "./shared";
import { Button } from "@/components/ui/button";
import { BarcodeLookup } from "./BarcodeLookup";

export function useOrderApi() {
  const { getToken } = useAuth();
  return useCallback(
    async (path: string, body?: unknown, signal?: AbortSignal) => {
      const token = await getToken();
      const r = await fetch("/api" + path, {
        method: body === undefined ? "GET" : "POST",
        signal,
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          "Content-Type": "application/json",
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      const data = await r.json();
      if (!r.ok)
        throw Object.assign(new Error(data.error ?? "無法保存"), { data });
      return data;
    },
    [getToken],
  );
}
export type DraftItem = {
  key: string;
  catalogProductId?: number;
  listingProductId?: number;
  name: string;
  quantity: number;
  unitPriceTwd: string;
  specValues: Record<string, string>;
  cost: Record<string, any>;
  saveCatalog?: boolean;
  barcode?: string;
  barcodeStatus?: "REAL" | "NONE";
};
export function draftItem(p?: CatalogProduct): DraftItem {
  return {
    key: crypto.randomUUID(),
    ...(p ? { catalogProductId: p.id } : {}),
    name: p?.name ?? "",
    quantity: 1,
    unitPriceTwd: "",
    specValues: {},
    cost: p
      ? {
          originalPriceJpy: p.currentCost?.originalPriceJpy ?? "",
          effectiveCostJpy: p.currentCost?.effectiveCostJpy ?? "",
          weightGrams: p.weightGrams,
          templateId: p.defaultPricingTemplateId ?? null,
          shippingProfileId: p.defaultShippingProfileId ?? null,
          tripRouteId: p.lastUsedTripRouteId ?? null,
          departmentStoreFeeRate: p.defaultDepartmentStoreFeeRate ?? null,
        }
      : {},
  };
}
export function orderDraftPayload(items: DraftItem[]) {
  return items.map((i) =>
    i.listingProductId
      ? {
          listingProductId: i.listingProductId,
          quantity: i.quantity,
          specValues: i.specValues,
        }
      : {
          ...(i.catalogProductId
            ? { catalogProductId: i.catalogProductId }
            : {}),
          name: i.name,
          quantity: i.quantity,
          unitPriceTwd: i.unitPriceTwd,
          specValues: i.specValues,
          cost: Object.fromEntries(
            Object.entries(i.cost).filter(([, v]) => v !== "" && v !== null),
          ),
          ...(i.saveCatalog
            ? {
                saveCatalog: {
                  name: i.name,
                  barcodeStatus: i.barcodeStatus ?? "REAL",
                  barcode: i.barcodeStatus === "NONE" ? "0" : i.barcode,
                  weightGrams: i.cost.weightGrams,
                  originalPriceJpy: i.cost.originalPriceJpy,
                  adjustmentMode: "MANUAL",
                  effectiveCostJpy: i.cost.effectiveCostJpy,
                  defaultShippingProfileId: i.cost.shippingProfileId ?? null,
                  defaultPricingTemplateId: i.cost.templateId ?? null,
                },
              }
            : {}),
        },
  );
}
export function CaptureCostFields({
  s,
  value,
  onChange,
}: {
  s: number;
  value: Record<string, any>;
  onChange: (v: Record<string, any>) => void;
}) {
  const api = useOrderApi();
  const settings = useCatalogQuery(s, ["order-cost-settings"], (signal) =>
    catalogSettingsGet(s, { signal }),
  );
  const trips = useCatalogQuery(s, ["order-cost-trips"], (signal) =>
    api(`/stores/${s}/order-cost-options`, undefined, signal),
  );
  const set = (k: string, v: any) => onChange({ ...value, [k]: v });
  return (
    <fieldset className="space-y-3">
      <legend className="font-medium">完整成本資料</legend>
      <p className="text-sm text-muted-foreground">
        未填齊可先建立待確認品項，完成訂單前須補齊。匯率與費率由店鋪設定取得。
      </p>
      {(
        [
          ["originalPriceJpy", "日本原價 ¥"],
          ["effectiveCostJpy", "有效進貨成本 ¥"],
          ["weightGrams", "重量 g"],
        ] as const
      ).map(([key, label]) => (
        <label key={key} className="block text-sm">
          {label}
          <input
            aria-label={label}
            inputMode="decimal"
            className={control}
            value={value[key] ?? ""}
            onChange={(e) => set(key, e.target.value)}
          />
        </label>
      ))}
      <label className="block text-sm">
        國際航運
        <select
          aria-label="國際航運"
          className={control}
          value={value.shippingProfileId ?? ""}
          onChange={(e) =>
            set(
              "shippingProfileId",
              e.target.value ? Number(e.target.value) : null,
            )
          }
        >
          <option value="">請選擇</option>
          {settings.data?.shippingProfiles
            .filter((p) => p.isActive)
            .map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} · {p.rateTwd}/{p.basisWeightGrams} g
              </option>
            ))}
        </select>
      </label>
      <label className="block text-sm">
        交通路線
        <select
          aria-label="交通路線"
          className={control}
          disabled={!!value.isTransportCostExempt}
          value={value.tripRouteId ?? ""}
          onChange={(e) =>
            set("tripRouteId", e.target.value ? Number(e.target.value) : null)
          }
        >
          <option value="">請選擇</option>
          {trips.data?.trips
            .filter((t: any) => t.storeId === s)
            .flatMap((t: any) =>
              (t.routes ?? []).map((r: any) => (
                <option key={r.id} value={r.id}>
                  {t.name} · {r.areaTitle}
                </option>
              )),
            )}
        </select>
      </label>
      <label className="flex min-h-11 items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={!!value.isTransportCostExempt}
          onChange={(e) =>
            onChange({
              ...value,
              isTransportCostExempt: e.target.checked,
              tripRouteId: e.target.checked ? null : value.tripRouteId,
            })
          }
        />
        明確免攤交通（仍須完整其他成本）
      </label>
      {settings.isError || trips.isError ? (
        <p role="alert">成本選項載入失敗，請重新開啟後再試。</p>
      ) : null}
    </fieldset>
  );
}
export function OrderItemsEditor({
  s,
  items,
  onChange,
  products = [],
}: {
  s: number;
  items: DraftItem[];
  onChange: (items: DraftItem[]) => void;
  products?: any[];
}) {
  const manualSearch = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState(""),
    search = useDebounced(q);
  const found = useCatalogQuery(
    s,
    ["order-catalog", search],
    (signal) => catalogList(s, { q: search, pageSize: "12" }, { signal }),
    !!search,
  );
  const update = (key: string, patch: Partial<DraftItem>) =>
    onChange(items.map((i) => (i.key === key ? { ...i, ...patch } : i)));
  return (
    <section aria-label="訂單品項" className="space-y-4">
      <h3 className="font-semibold">訂單品項</h3>
      <label className="block text-sm">
        搜尋資料庫商品
        <input
          ref={manualSearch}
          aria-label="搜尋資料庫商品"
          className={control}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </label>
      <BarcodeLookup
        key={s}
        s={s}
        onManualSearch={() => manualSearch.current?.focus()}
        renderProductActions={(p, close) => (
          <Button
            type="button"
            className={
              action +
              " h-auto min-w-0 max-w-full whitespace-normal break-words text-left"
            }
            onClick={() => {
              close();
              onChange([...items, draftItem(p)]);
            }}
          >
            加入 {p.name}
          </Button>
        )}
        renderCreateAction={(barcode, close) => (
          <Button
            type="button"
            className={action}
            onClick={() => {
              close();
              onChange([
                ...items,
                {
                  ...draftItem(),
                  saveCatalog: true,
                  barcodeStatus: "REAL",
                  barcode,
                },
              ]);
            }}
          >
            新增條碼品項草稿
          </Button>
        )}
      />
      {search &&
        found.data?.items.map((p) => (
          <Button
            key={p.id}
            type="button"
            variant="outline"
            className={action + " w-full justify-start whitespace-normal"}
            onClick={() => {
              onChange([...items, draftItem(p)]);
              setQ("");
            }}
          >
            加入 {p.name}
          </Button>
        ))}
      <label className="block text-sm">
        加入上架商品
        <select
          aria-label="加入上架商品"
          className={control}
          value=""
          onChange={(e) => {
            const p = products.find((p) => p.id === Number(e.target.value));
            if (p)
              onChange([
                ...items,
                {
                  ...draftItem(),
                  listingProductId: p.id,
                  name: p.name,
                  unitPriceTwd: String(p.price),
                },
              ]);
          }}
        >
          <option value="">選擇上架商品</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      <Button
        type="button"
        variant="outline"
        className={action}
        onClick={() => onChange([...items, draftItem()])}
      >
        加入一次性品項
      </Button>
      {items.map((i, index) => (
        <article
          key={i.key}
          className="space-y-3 rounded-xl border border-border p-3"
        >
          <div className="flex items-center justify-between">
            <h4 className="font-medium">
              品項 {index + 1} ·{" "}
              {i.catalogProductId
                ? "商品資料庫"
                : i.listingProductId
                  ? "上架商品"
                  : "一次性"}
            </h4>
            <Button
              type="button"
              variant="ghost"
              className={action}
              aria-label={`移除品項 ${index + 1}`}
              onClick={() => onChange(items.filter((x) => x.key !== i.key))}
            >
              移除
            </Button>
          </div>
          <label className="block text-sm">
            品名
            <input
              aria-label={`品項 ${index + 1} 品名`}
              className={control}
              readOnly={!!(i.catalogProductId || i.listingProductId)}
              value={i.name}
              onChange={(e) => update(i.key, { name: e.target.value })}
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm">
              數量
              <input
                aria-label={`品項 ${index + 1} 數量`}
                className={control}
                type="number"
                min="1"
                step="1"
                value={i.quantity}
                onChange={(e) =>
                  update(i.key, { quantity: Number(e.target.value) })
                }
              />
            </label>
            <label className="block text-sm">
              單價 NT$
              <input
                aria-label={`品項 ${index + 1} 單價`}
                className={control}
                inputMode="decimal"
                readOnly={!!i.listingProductId}
                value={i.unitPriceTwd}
                onChange={(e) =>
                  update(i.key, { unitPriceTwd: e.target.value })
                }
              />
            </label>
          </div>
          {i.listingProductId ? (
            <p className="text-xs text-muted-foreground">
              上架售價將依所選客戶身分由伺服器決定。
            </p>
          ) : (
            <details>
              <summary className="min-h-11 cursor-pointer py-3">
                成本與保存資料庫
              </summary>
              <CaptureCostFields
                s={s}
                value={i.cost}
                onChange={(cost) => update(i.key, { cost })}
              />
              {!i.catalogProductId && (
                <>
                  <label className="flex min-h-11 items-center gap-2">
                    <input
                      type="checkbox"
                      checked={!!i.saveCatalog}
                      onChange={(e) =>
                        update(i.key, { saveCatalog: e.target.checked })
                      }
                    />
                    加入訂單並存入商品資料庫
                  </label>
                  {i.saveCatalog && (
                    <>
                      <label className="block">
                        條碼
                        <input
                          aria-label={`品項 ${index + 1} 條碼`}
                          className={control}
                          disabled={i.barcodeStatus === "NONE"}
                          value={i.barcode ?? ""}
                          onChange={(e) =>
                            update(i.key, { barcode: e.target.value })
                          }
                        />
                      </label>
                      <label className="flex min-h-11 items-center gap-2">
                        <input
                          type="checkbox"
                          checked={i.barcodeStatus === "NONE"}
                          onChange={(e) =>
                            update(i.key, {
                              barcodeStatus: e.target.checked ? "NONE" : "REAL",
                            })
                          }
                        />
                        明確無條碼
                      </label>
                    </>
                  )}
                </>
              )}
            </details>
          )}
          {!i.listingProductId && (
            <label className="block text-sm">
              配送溫層
              <select
                aria-label={`品項 ${index + 1} 配送溫層`}
                className={control}
                value={i.specValues["溫層"] ?? ""}
                onChange={(e) =>
                  update(i.key, {
                    specValues: { ...i.specValues, 溫層: e.target.value },
                  })
                }
              >
                <option value="">未指定（匯出配送前須確認）</option>
                <option value="常溫">常溫</option>
                <option value="冷凍">冷凍</option>
              </select>
            </label>
          )}
          <label className="block text-sm">
            規格
            <input
              aria-label={`品項 ${index + 1} 規格`}
              className={control}
              value={i.specValues["規格"] ?? ""}
              onChange={(e) =>
                update(i.key, {
                  specValues: { ...i.specValues, 規格: e.target.value },
                })
              }
            />
          </label>
          <p>
            品項小計{" "}
            <Money
              currency="TWD"
              value={String(Number(i.unitPriceTwd || 0) * i.quantity)}
            />
          </p>
        </article>
      ))}
      <p className="font-semibold">
        商品小計 NT${" "}
        {items
          .reduce((sum, i) => sum + Number(i.unitPriceTwd || 0) * i.quantity, 0)
          .toLocaleString()}
        （上架客戶價以保存結果為準）
      </p>
    </section>
  );
}
export function PendingItemCapture({
  s,
  orderId,
  item,
  onSaved,
}: {
  s: number;
  orderId: number;
  item: any;
  onSaved: () => void;
}) {
  const api = useOrderApi();
  const [open, setOpen] = useState(false),
    [value, setValue] = useState<Record<string, any>>({}),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <div className="space-y-2">
      <p>
        {item.productNameSnapshot} ·{" "}
        {item.profitSnapshotStatus === "PENDING"
          ? "成本待確認"
          : `已捕捉 ${item.capturedAt ?? ""}`}
      </p>
      {item.profitSnapshotStatus === "PENDING" && (
        <>
          <Button
            className={action}
            variant="outline"
            onClick={() => setOpen((v) => !v)}
          >
            補齊成本 · {item.productNameSnapshot}
          </Button>
          {open && (
            <>
              <CaptureCostFields s={s} value={value} onChange={setValue} />
              {error && <p role="alert">{error}</p>}
              <Button
                disabled={busy}
                className={action}
                onClick={async () => {
                  setBusy(true);
                  setError("");
                  try {
                    await api(
                      `/stores/${s}/orders/${orderId}/items/${item.id}/capture`,
                      Object.fromEntries(
                        Object.entries(value).filter(
                          ([, v]) => v !== "" && v !== null,
                        ),
                      ),
                    );
                    setOpen(false);
                    onSaved();
                  } catch (e) {
                    setError((e as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {busy ? "保存中…" : "確認捕捉成本"}
              </Button>
            </>
          )}
        </>
      )}
    </div>
  );
}
