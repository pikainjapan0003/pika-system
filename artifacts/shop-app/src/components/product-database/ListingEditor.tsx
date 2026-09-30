import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import {
  catalogGet,
  catalogList,
  catalogSettingsGet,
  createCatalogListing,
  recalculateListingPricing,
  getListingPricingHistory,
  type CatalogProduct,
  type ListingPricingInput,
} from "@workspace/api-client-react";
import {
  useCatalogQuery,
  useDebounced,
  control,
  panel,
  action,
  Money,
  Failure,
} from "./shared";
import { Button } from "@/components/ui/button";
import { formatCatalogNumber } from "@/lib/productDatabase";
import {
  listingErrorFields,
  useListingDirtyFields,
  useListingRequestScope,
} from "./listingFormState";
import { BarcodeLookup } from "./BarcodeLookup";

type Fields = {
  name: string;
  description: string;
  price: string;
  vipPrice: string;
  wholesalePrice: string;
  partnerPrice: string;
  weightKg: string;
  costJpy: string;
  imageUrl: string;
  internalNote: string;
  categoryId: number | null;
  tripRouteId: number | null;
  isTransportCostExempt: boolean;
};
type Setters = {
  [K in keyof Fields as `set${Capitalize<K>}`]: (value: Fields[K]) => void;
};
const textError = (e: any) => e?.data?.error ?? e?.message ?? "無法完成操作";
const syncLabels = {
  name: "名稱",
  weightGrams: "重量",
  categoryId: "分類",
  imageUrl: "圖片",
  internalNote: "備註",
  templateId: "計價模板",
  shippingProfileId: "國際運費",
  cost: "原價及實際成本（追加紀錄）",
  barcode: "條碼（正式更正）",
} as const;
export function useListingEditor(
  s: number | undefined,
  productId: number | undefined,
  existing: any,
  trips: any[],
  f: Fields,
  set: Setters,
  onError?: (message: string, fields?: string[]) => void,
) {
  const api = useOrderApi();
  const manualSearch = useRef<HTMLInputElement>(null);
  const dirty = useListingDirtyFields();
  const scope = useListingRequestScope(`${s}:${productId}`);
  const [preserved, setPreserved] = useState<string[]>([]);
  const [catalog, setCatalog] = useState<CatalogProduct | null>(null),
    [q, setQ] = useState(""),
    [page, setPage] = useState(1);
  const [original, setOriginal] = useState(""),
    [barcode, setBarcode] = useState(""),
    [template, setTemplate] = useState<number | null>(null),
    [shipping, setShipping] = useState<number | null>(null),
    [fee, setFee] = useState("");
  const [trip, setTrip] = useState<number | null>(null),
    [routeHint, setRouteHint] = useState(""),
    [vipSource, setVipSource] = useState<
      "FOLLOW_GENERAL" | "FORMAL_HISTORY" | "MANUAL"
    >(productId ? "MANUAL" : "FOLLOW_GENERAL");
  const vipManual = vipSource !== "FOLLOW_GENERAL",
    vipManualRef = useRef(!!productId);
  function setVipManual(value: boolean) {
    vipManualRef.current = value;
    setVipSource(value ? "MANUAL" : "FOLLOW_GENERAL");
  }
  const [quote, setQuote] = useState<any>(null),
    [problem, setProblem] = useState(""),
    [busy, setBusy] = useState(false),
    [confirm, setConfirm] = useState(false),
    [latest, setLatest] = useState(false);
  const [sync, setSync] = useState<(keyof typeof syncLabels)[]>([]),
    [reason, setReason] = useState(""),
    [forceBarcode, setForceBarcode] = useState(false);
  const [deepPending, setDeepPending] = useState(false),
    [showDifference, setShowDifference] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(true),
    [conflicts, setConflicts] = useState<any[]>([]);
  const search = useDebounced(q),
    loaded = useRef<string>("");
  const previousStore = useRef(s);
  const validExisting =
    existing?.storeId === s && existing?.id === productId ? existing : null;
  const catalogId =
    catalog && catalog.storeId === s
      ? catalog.id
      : (validExisting?.catalogProductId ?? null);
  const settings = useCatalogQuery(
    s ?? 0,
    ["listing-settings"],
    (signal) => catalogSettingsGet(s!, { signal }),
    !!s,
  );
  const results = useCatalogQuery(
    s ?? 0,
    ["listing-picker", search, page],
    (signal) =>
      catalogList(
        s!,
        { q: search || undefined, page: String(page), pageSize: "12" },
        { signal },
      ),
    !!s && !productId,
  );
  const history = useCatalogQuery(
    s ?? 0,
    ["listing-history", productId, scope.epoch],
    (signal) => getListingPricingHistory(s!, productId!, { signal }),
    !!s && !!productId && !!validExisting?.catalogProductId,
  );
  const options = useCatalogQuery(
    s ?? 0,
    ["listing-options", catalogId, productId, template, shipping, scope.epoch],
    (signal) =>
      productId
        ? recalculateListingPricing(
            s!,
            productId,
            {
              mode: "PREVIEW",
              templateId: template,
              shippingProfileId: shipping,
            },
            { signal },
          )
        : createCatalogListing(
            s!,
            catalogId!,
            {
              mode: "PREVIEW",
              templateId: template,
              shippingProfileId: shipping,
            },
            { signal },
          ),
    !!s && !!catalogId,
  );
  const ownTrips = (
      (options.data as any)?.availableTrips ??
      (history.data as any)?.availableTrips ??
      []
    ).filter((t: any) => t.storeId === s),
    selectedTrip = ownTrips.find((t: any) => t.id === trip);
  const routes = (selectedTrip?.routes ?? [])
    .filter((r: any) => r.storeId === s)
    .map((r: any) => ({ ...r, tripName: selectedTrip.name }));
  const input: ListingPricingInput = {
    name: f.name,
    description: f.description || null,
    imageUrl: f.imageUrl || null,
    internalNote: f.internalNote || null,
    categoryId: f.categoryId,
    originalPriceJpy: original || null,
    effectiveCostJpy: f.costJpy || null,
    weightGrams: f.weightKg || null,
    templateId: template,
    shippingProfileId: shipping,
    tripRouteId: f.isTransportCostExempt ? null : f.tripRouteId,
    isTransportCostExempt: f.isTransportCostExempt,
    departmentStoreFeeRate: fee || null,
    generalFinalPriceTwd: f.price || null,
    vipFinalPriceTwd: f.vipPrice || null,
    wholesalePrice: f.wholesalePrice || null,
    partnerPrice: f.partnerPrice || null,
    listingBarcode: barcode || null,
    useLatestCost: latest,
    syncFields: sync,
    reasonCode: "OTHER",
    reasonText: reason || null,
    forceBarcodeCorrection: forceBarcode,
  };
  const inputKey = JSON.stringify(input);
  const currentInput = useRef(inputKey);
  currentInput.current = inputKey;
  // A confirmation applies only to the preview that displayed it.
  useEffect(() => {
    setConfirm(false);
  }, [inputKey]);
  useEffect(() => {
    if (!vipManual) set.setVipPrice(f.price);
  }, [f.price, vipManual]);
  function chooseRoute(tid: number | null, p: CatalogProduct | null) {
    setTrip(tid);
    set.setTripRouteId(null);
    setRouteHint("");
    if (!tid || !p?.preferredRouteLabel) return;
    const candidates = (
      ownTrips.find((t: any) => t.id === tid)?.routes ?? []
    ).filter(
      (r: any) => r.storeId === s && r.areaTitle === p.preferredRouteLabel,
    );
    if (candidates.length === 1) set.setTripRouteId(candidates[0].id);
    else
      setRouteHint(
        candidates.length
          ? "此旅程有多條同名路線，請自行選擇。"
          : "此旅程沒有偏好路線，請自行選擇。",
      );
  }
  function choose(p: CatalogProduct) {
    if (p.storeId !== s) return;
    scope.invalidate();
    setDeepPending(false);
    setBusy(false);
    setShowDifference(false);
    setConfirm(false);
    onError?.("");
    if (!productId) {
      const url = new URL(window.location.href);
      url.searchParams.set("catalogId", String(p.id));
      window.history.replaceState(
        null,
        "",
        url.pathname + url.search + url.hash,
      );
    }
    setPickerOpen(false);
    setConflicts([]);
    const kept: string[] = [];
    const load = (key: string, label: string, apply: () => void) => {
      if (dirty.has(key)) kept.push(label);
      else apply();
    };
    setCatalog(p);
    load("name", "名稱", () => set.setName(p.name));
    load("imageUrl", "圖片", () => set.setImageUrl(p.imageUrl ?? ""));
    load("categoryId", "分類", () => set.setCategoryId(p.categoryId ?? null));
    load("internalNote", "備註", () =>
      set.setInternalNote(p.internalNote ?? ""),
    );
    load("weightKg", "重量", () => set.setWeightKg(p.weightGrams));
    load("costJpy", "實際成本", () =>
      set.setCostJpy(p.currentCost?.effectiveCostJpy ?? ""),
    );
    load("original", "日本原價", () =>
      setOriginal(p.currentCost?.originalPriceJpy ?? ""),
    );
    load("barcode", "上架條碼", () =>
      setBarcode(p.barcodeStatus === "REAL" ? p.barcode : ""),
    );
    load("template", "計價模板", () =>
      setTemplate(p.defaultPricingTemplateId ?? null),
    );
    load("shipping", "國際運費", () =>
      setShipping(p.defaultShippingProfileId ?? null),
    );
    load("fee", "百貨費率", () =>
      setFee(p.defaultDepartmentStoreFeeRate ?? ""),
    );
    setPreserved(kept);
    // General price is user-owned. A new Catalog resets VIP provenance and route only.
    setVipManual(false);
    setSync([]);
    setReason("");
    setForceBarcode(false);
    setQuote(null);
    setProblem("");
    setLatest(false);
    chooseRoute(trip, p);
    const vipToken = scope.capture();
    api(`/stores/${s}/catalog-sales?ids=${p.id}`)
      .then((r) => {
        if (!scope.current(vipToken) || vipManualRef.current || productId)
          return;
        const latest = r.items[0]?.vip?.latestPriceTwd;
        if (latest != null) {
          setVipSource("FORMAL_HISTORY");
          set.setVipPrice(latest);
        }
      })
      .catch((e) => {
        if (scope.current(vipToken)) setProblem(textError(e));
      });
  }
  useEffect(() => {
    const storeChanged =
      previousStore.current !== undefined && previousStore.current !== s;
    previousStore.current = s;
    if (storeChanged) {
      const url = new URL(window.location.href);
      url.searchParams.delete("catalogId");
      window.history.replaceState(
        null,
        "",
        url.pathname + url.search + url.hash,
      );
    }
    dirty.reset();
    setPreserved([]);
    setVipManual(!!productId);
    setPickerOpen(true);
    setQ("");
    setPage(1);
    setRouteHint("");
    setConfirm(false);
    setLatest(false);
    setReason("");
    setForceBarcode(false);
    setConflicts([]);
    setDeepPending(false);
    setBusy(false);
    setShowDifference(false);
    set.setIsTransportCostExempt(false);
    setCatalog(null);
    setQuote(null);
    setSync([]);
    setProblem("");
    setTrip(null);
    set.setTripRouteId(null);
    loaded.current = "";
    setOriginal("");
    setBarcode("");
    setTemplate(null);
    setShipping(null);
    setFee("");
    set.setName("");
    set.setDescription("");
    set.setPrice("");
    set.setVipPrice("");
    set.setWholesalePrice("");
    set.setPartnerPrice("");
    set.setWeightKg("");
    set.setCostJpy("");
    set.setImageUrl("");
    set.setInternalNote("");
    set.setCategoryId(null);
    if (!s || productId) return;
    const raw = new URLSearchParams(window.location.search).get("catalogId");
    if (!raw) return;
    if (!/^[1-9][0-9]*$/.test(raw) || Number(raw) > 2147483647) {
      setProblem("資料庫商品 ID 格式不正確");
      setDeepPending(true);
      return;
    }
    const token = scope.begin("deep");
    setDeepPending(true);
    catalogGet(s, Number(raw))
      .then((r) => {
        if (scope.current(token)) choose(r.product);
      })
      .catch((e) => {
        if (scope.current(token)) setProblem(textError(e));
      });
  }, [s, productId]);
  useEffect(() => {
    if (!history.data || !s || loaded.current === s + ":" + productId) return;
    const h = history.data as any,
      p = h.product,
      cur = h.current;
    if (p.storeId !== s || p.id !== productId) return;
    const token = scope.capture();
    loaded.current = s + ":" + productId;
    if (!dirty.has("original")) setOriginal(p.originalPriceJpy ?? "");
    if (!dirty.has("costJpy")) set.setCostJpy(p.effectiveCostJpy ?? "");
    if (!dirty.has("weightKg")) set.setWeightKg(p.weightGrams ?? "");
    if (!dirty.has("price")) set.setPrice(p.price);
    if (!dirty.has("vipPrice")) set.setVipPrice(p.vipPrice ?? p.price);
    if (!dirty.has("barcode")) setBarcode(cur?.listingBarcode ?? "");
    if (!dirty.has("template")) setTemplate(p.pricingTemplateId);
    if (!dirty.has("shipping")) setShipping(p.internationalShippingProfileId);
    if (!dirty.has("fee"))
      setFee(cur?.pricingContext?.input?.departmentStoreFeeRate ?? "");
    setVipManual(true);
    if (!dirty.has("tripRouteId")) set.setTripRouteId(p.tripRouteId);
    if (!dirty.has("isTransportCostExempt"))
      set.setIsTransportCostExempt(p.isTransportCostExempt ?? false);
    catalogGet(s, p.catalogProductId)
      .then((r) => {
        if (scope.current(token) && r.product.storeId === s)
          setCatalog(r.product);
      })
      .catch((e) => {
        if (scope.current(token)) setProblem(textError(e));
      });
  }, [history.data, s, productId]);
  useEffect(() => {
    if (productId && f.tripRouteId != null && trip === null) {
      const found = ownTrips.find((t: any) =>
        (t.routes ?? []).some(
          (r: any) => r.id === f.tripRouteId && r.storeId === s,
        ),
      );
      if (found) setTrip(found.id);
    }
  }, [options.data, history.data, productId, f.tripRouteId, trip]);
  async function request(body: ListingPricingInput) {
    return productId
      ? recalculateListingPricing(s!, productId, body)
      : createCatalogListing(s!, catalogId!, body);
  }
  async function preview(useLatest = false) {
    if (!catalogId) return;
    setBusy(true);
    setProblem("");
    onError?.("");
    setConflicts([]);
    const token = scope.begin("operation");
    let expectedInput = inputKey;
    try {
      let body = { ...input, mode: "PREVIEW" as const };
      if (useLatest) {
        const fresh = (await catalogGet(s!, catalogId)).product;
        if (!scope.current(token) || currentInput.current !== expectedInput)
          return;
        if (!fresh.currentCost)
          throw Error("目前沒有有效成本，請先在資料庫新增成本。");
        setOriginal(fresh.currentCost.originalPriceJpy);
        set.setCostJpy(fresh.currentCost.effectiveCostJpy);
        setLatest(true);
        body = {
          ...body,
          originalPriceJpy: fresh.currentCost.originalPriceJpy,
          effectiveCostJpy: fresh.currentCost.effectiveCostJpy,
          useLatestCost: true,
        };
        expectedInput = JSON.stringify({
          ...input,
          originalPriceJpy: fresh.currentCost.originalPriceJpy,
          effectiveCostJpy: fresh.currentCost.effectiveCostJpy,
          useLatestCost: true,
        });
      }
      const result = await request(body);
      if (!scope.current(token) || currentInput.current !== expectedInput)
        return;
      setQuote(result);
      setConfirm(false);
      setShowDifference(true);
    } catch (e) {
      if (scope.current(token) && currentInput.current === expectedInput) {
        setProblem(textError(e));
        onError?.(textError(e), listingErrorFields(e));
      }
    } finally {
      if (scope.current(token)) setBusy(false);
    }
  }
  async function save(extra: Record<string, unknown>) {
    if (deepPending) throw Error("請先載入有效資料庫商品，或明確略過資料庫。");
    if (!quote) throw Error("請先預覽計價並確認資料。");
    setBusy(true);
    const token = scope.begin("operation");
    try {
      const result = await request({
        ...input,
        ...extra,
        mode: "SAVE",
        expectedContext: quote.reference.context,
        confirmLowProfit: confirm,
      } as ListingPricingInput);
      return scope.current(token) ? result : undefined;
    } catch (e: any) {
      if (!scope.current(token)) return;
      setProblem(textError(e));
      setConflicts(e?.data?.details?.candidates ?? []);
      throw e;
    } finally {
      if (scope.current(token)) setBusy(false);
    }
  }
  function skip() {
    scope.invalidate();
    setCatalog(null);
    setDeepPending(false);
    setBusy(false);
    setProblem("");
    onError?.("");
    setQuote(null);
    setShowDifference(false);
    setConfirm(false);
    setLatest(false);
    setConflicts([]);
    setSync([]);
    setReason("");
    setForceBarcode(false);
    setTrip(null);
    set.setTripRouteId(null);
    setRouteHint("");
    window.history.replaceState(null, "", window.location.pathname);
  }
  const old = (history.data as any)?.current;
  const diffValue = (key: string, previous: boolean) => {
    const before: any = {
      name: catalog?.name,
      weightGrams: catalog?.weightGrams,
      categoryId: catalog?.categoryId,
      imageUrl: catalog?.imageUrl,
      internalNote: catalog?.internalNote,
      templateId: catalog?.defaultPricingTemplateId,
      shippingProfileId: catalog?.defaultShippingProfileId,
      cost: catalog?.currentCost
        ? [
            catalog.currentCost.originalPriceJpy,
            catalog.currentCost.effectiveCostJpy,
          ].join(" / ")
        : null,
      barcode: catalog?.barcodeStatus === "REAL" ? catalog.barcode : null,
    };
    const after: any = {
      name: f.name,
      weightGrams: f.weightKg,
      categoryId: f.categoryId,
      imageUrl: f.imageUrl,
      internalNote: f.internalNote,
      templateId: template,
      shippingProfileId: shipping,
      cost: [original, f.costJpy].join(" / "),
      barcode,
    };
    return String((previous ? before : after)[key] ?? "未設定") || "未設定";
  };
  const money = (value: any) => (
    <Money value={typeof value === "string" ? value : null} currency="TWD" />
  );
  const field = (
    label: string,
    value: string,
    onChange: (s: string) => void,
    key?: string,
  ) => (
    <label className="block space-y-1 text-sm">
      {label}
      <input
        aria-label={label}
        className={control}
        value={value}
        onChange={(e) => {
          if (key) dirty.mark(key);
          onChange(e.target.value);
        }}
      />
    </label>
  );
  const panelNode = (
    <section className={panel + " space-y-4"} aria-label="資料庫上架計價">
      <h2 className="font-semibold">資料庫上架計價</h2>
      {!!s && !productId && (
        <BarcodeLookup
          key={s}
          s={s}
          onManualSearch={() => {
            setPickerOpen(true);
            requestAnimationFrame(() => manualSearch.current?.focus());
          }}
          renderProductActions={(p, close) => (
            <Button
              type="button"
              className={
                action +
                " h-auto min-w-0 max-w-full whitespace-normal break-words text-left"
              }
              onClick={() => {
                close();
                choose(p);
              }}
            >
              載入 {p.name}
            </Button>
          )}
          renderCreateAction={(barcode, close) => (
            <Button
              asChild
              variant="outline"
              className={action + " h-auto min-w-0 whitespace-normal text-left"}
            >
              <a
                href={`/product-database/new?barcode=${encodeURIComponent(barcode)}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={close}
              >
                另開分頁新增，保留目前草稿
              </a>
            </Button>
          )}
        />
      )}
      {!!preserved.length && (
        <p role="status" className="text-sm">
          已保留你手動編輯的{preserved.join("、")}
          ；其他欄位已載入所選商品。一般售價維持你的輸入。
        </p>
      )}
      {!productId && catalogId && (
        <Button
          type="button"
          className={action}
          variant="outline"
          onClick={() => setPickerOpen((v) => !v)}
        >
          更換資料庫商品
        </Button>
      )}
      {!productId && (!catalogId || pickerOpen) && (
        <>
          <label className="block space-y-1 text-sm">
            搜尋名稱或手動輸入條碼
            <input
              ref={manualSearch}
              className={control}
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
            />
          </label>
          {results.isError ? (
            <Failure
              error={results.error}
              retry={() => void results.refetch()}
            />
          ) : (
            <div className="max-h-56 overflow-y-auto space-y-2">
              {results.data?.items.map((p) => (
                <Button
                  key={p.id}
                  type="button"
                  variant="outline"
                  className={
                    action + " w-full justify-start whitespace-normal text-left"
                  }
                  onClick={() => choose(p)}
                >
                  {p.name} · {p.barcodeStatus === "NONE" ? "無條碼" : p.barcode}
                  {p.status === "DISCONTINUED" ? " · 店鋪停售" : ""}
                </Button>
              ))}
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              className={action}
              variant="outline"
              disabled={page === 1}
              onClick={() => setPage((p) => p - 1)}
            >
              上一頁
            </Button>
            <Button
              type="button"
              className={action}
              variant="outline"
              disabled={!results.data || page * 12 >= results.data.total}
              onClick={() => setPage((p) => p + 1)}
            >
              下一頁
            </Button>
            <Button
              type="button"
              className={action}
              variant="outline"
              onClick={skip}
            >
              略過資料庫，手動建立
            </Button>
          </div>
        </>
      )}
      {catalogId && (
        <>
          <p className="text-sm">
            已連結：{catalog?.name ?? catalogId}{" "}
            <Link
              className="inline-flex min-h-11 items-center underline"
              href={`/product-database/${catalogId}`}
            >
              查看資料庫／恢復封存／另建商品
            </Link>
          </p>
          {catalog?.status === "ARCHIVED" && (
            <p role="alert">此商品已封存。新增上架前請至資料庫明確恢復狀態。</p>
          )}
          {catalog?.status === "DISCONTINUED" && (
            <p>資料庫標記為店鋪停售，仍可查看及手動上架；狀態不會自動改動。</p>
          )}
          {field("上架條碼（不等於 SKU）", barcode, setBarcode, "barcode")}
          <p className="text-xs text-secondary-foreground">
            無條碼請留空；若是另一商品，請先另建資料庫商品。
          </p>
          {field("日本原始售價 JPY", original, setOriginal, "original")}
          <p className="text-xs text-secondary-foreground">
            實際成本與重量在下方原商品欄位中編輯，與原價分開保存。
          </p>
          <label className="block space-y-1 text-sm">
            計價模板
            <select
              aria-label="計價模板"
              className={control}
              value={template ?? ""}
              onChange={(e) => {
                dirty.mark("template");
                setTemplate(e.target.value ? Number(e.target.value) : null);
              }}
            >
              <option value="">未選擇</option>
              {settings.data?.templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                  {t.isActive ? "" : "（已停用，請重新選擇）"}
                </option>
              ))}
            </select>
          </label>
          <label className="block space-y-1 text-sm">
            國際運費方案
            <select
              aria-label="國際運費方案"
              className={control}
              value={shipping ?? ""}
              onChange={(e) => {
                dirty.mark("shipping");
                setShipping(e.target.value ? Number(e.target.value) : null);
              }}
            >
              <option value="">使用模板設定</option>
              {settings.data?.shippingProfiles.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                  {t.isActive ? "" : "（已停用，請重新選擇）"}
                </option>
              ))}
            </select>
          </label>
          {settings.isError && (
            <Failure
              error={settings.error}
              retry={() => void settings.refetch()}
            />
          )}
          {settings.data?.templates.length === 0 && (
            <p>
              尚無模板與運費設定，請至
              <Link
                href="/product-database"
                className="underline inline-flex min-h-11 items-center"
              >
                資料庫計價設定
              </Link>
              明確建立。
            </p>
          )}
          {field("百貨手續費率（空白使用模板）", fee, setFee, "fee")}
          <label className="block space-y-1 text-sm">
            選擇旅程
            <select
              aria-label="選擇旅程"
              className={control}
              value={trip ?? ""}
              onChange={(e) =>
                chooseRoute(
                  e.target.value ? Number(e.target.value) : null,
                  catalog,
                )
              }
            >
              <option value="">請選擇旅程</option>
              {ownTrips.map((t: any) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          {options.isError && (
            <Failure
              error={options.error}
              retry={() => void options.refetch()}
            />
          )}
          {routeHint && <p role="status">{routeHint}</p>}
          <p className="text-sm">
            一般售價由你填寫；目標售價僅供參考。VIP 來源：
            {vipSource === "FORMAL_HISTORY"
              ? "最近正式 VIP 成交"
              : vipManual
                ? "手動輸入／此上架原有售價"
                : "尚無正式 VIP 成交，跟隨一般售價"}
            。
          </p>
          <Button
            type="button"
            className={action}
            variant="outline"
            onClick={() => setVipManual(false)}
          >
            VIP 重新跟隨一般售價
          </Button>
          {history.isError && (
            <Failure
              error={history.error}
              retry={() => void history.refetch()}
            />
          )}
          {(history.data as any)?.costUpdated && (
            <p role="status" className="font-semibold">
              成本資料已更新，既有售價及原本估算維持不變。
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              aria-label="預覽目前輸入"
              className={action}
              disabled={busy}
              onClick={() => void preview()}
            >
              預覽目前輸入
            </Button>
            {productId && (
              <Button
                type="button"
                className={action}
                variant="outline"
                disabled={busy}
                onClick={() => void preview(true)}
              >
                依最新成本重算
              </Button>
            )}
            <Button
              type="button"
              className={action}
              variant="outline"
              onClick={() => setShowDifference((v) => !v)}
            >
              查看差異
            </Button>
          </div>
          {showDifference && (
            <div className="space-y-3">
              <p className="text-sm">
                預覽不會修改價格。確認後使用上方儲存，手動套用新價格。
              </p>
              {quote && (
                <p className="text-xs">
                  資料庫目前原價{" "}
                  <Money value={quote.reference.latestOriginalPriceJpy} />
                  ／有效成本{" "}
                  <Money value={quote.reference.latestEffectiveCostJpy} />
                  。手動輸入仍保留。
                </p>
              )}
              {productId && (
                <Button
                  type="submit"
                  className={action}
                  disabled={busy || !quote}
                >
                  手動套用新價格
                </Button>
              )}
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <h3 className="font-semibold">原本估算</h3>
                  <p>成本 {money(old?.totalCostTwd)}</p>
                  <p>一般淨利 {money(old?.generalNetProfitTwd)}</p>
                  <p>VIP 淨利 {money(old?.vipNetProfitTwd)}</p>
                </div>
                <div>
                  <h3 className="font-semibold">目前重算</h3>
                  <p>成本 {money(quote?.preview.amounts.totalCostTwd)}</p>
                  <p>
                    一般淨利 {money(quote?.preview.general.values.netProfitTwd)}
                  </p>
                  <p>
                    VIP 淨利 {money(quote?.preview.vip.values.netProfitTwd)}
                  </p>
                  <p>參考目標 {money(quote?.preview.amounts.targetPriceTwd)}</p>
                </div>
              </div>
              {quote?.preview.status === "PENDING_CONFIRMATION" && (
                <p role="status">待確認：{quote.preview.reasons.join("、")}</p>
              )}
              {!!quote?.warnings.length && (
                <label className="flex min-h-11 items-center gap-2">
                  <input
                    type="checkbox"
                    checked={confirm}
                    onChange={(e) => setConfirm(e.target.checked)}
                  />
                  一般或 VIP 利潤偏低／虧損，我確認仍要儲存
                </label>
              )}
              {old && (
                <details>
                  <summary className="min-h-11 cursor-pointer">
                    查看歷史估算（{history.data?.items.length ?? 0} 筆）
                  </summary>
                  {history.data?.items.map((h) => (
                    <p className="py-2 text-sm" key={h.id}>
                      #{h.id} 一般 {money(h.generalFinalPriceTwd)}／VIP{" "}
                      {money(h.vipFinalPriceTwd)} · 成本 {money(h.totalCostTwd)}
                    </p>
                  ))}
                </details>
              )}
            </div>
          )}
          <fieldset className="space-y-2">
            <legend className="font-medium">
              明確同步回資料庫（預設不勾選）
            </legend>
            <p className="text-xs">
              只同步你勾選的欄位。條碼若代表不同商品，請先另建資料庫商品。
            </p>
            {Object.entries(syncLabels).map(([key, label]) => (
              <label
                key={key}
                className="flex min-h-11 items-center gap-2 text-sm"
              >
                <input
                  type="checkbox"
                  checked={sync.includes(key as any)}
                  onChange={(e) =>
                    setSync((v) =>
                      e.target.checked
                        ? [...v, key as any]
                        : v.filter((x) => x !== key),
                    )
                  }
                />
                <span className="min-w-0 break-words">
                  {label}
                  <span className="block text-xs text-secondary-foreground">
                    {diffValue(key, true)} → {diffValue(key, false)}
                  </span>
                </span>
              </label>
            ))}
          </fieldset>
          {sync.includes("barcode") && (
            <>
              {field("條碼更正原因（必填）", reason, setReason)}
              <label className="flex min-h-11 items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={forceBarcode}
                  onChange={(e) => setForceBarcode(e.target.checked)}
                />
                若條碼重複，我確認仍要正式更正
              </label>
            </>
          )}
        </>
      )}
      {problem && (
        <p role="alert" className="break-words text-sm text-destructive">
          {problem}
        </p>
      )}
      {conflicts.map((c) => (
        <Link
          key={c.id}
          className={action + " inline-flex items-center underline"}
          href={`/product-database/${c.id}`}
        >
          查看同條碼商品：{c.name}
        </Link>
      ))}
    </section>
  );
  return {
    catalogId,
    busy,
    deepPending,
    panel: panelNode,
    save,
    routes,
    captureContext: scope.capture,
    isCurrentContext: scope.current,
    markDirty: dirty.mark,
    isDirty: dirty.has,
    setVipPrice: (value: string) => {
      dirty.mark("vipPrice");
      setVipManual(true);
      set.setVipPrice(value);
    },
  };
}
import { useOrderApi } from "./OrderItemsEditor";
