import { useState, useRef } from "react";
import { Link, useLocation } from "wouter";
import {
  catalogCreate,
  catalogGet,
  catalogPatch,
  catalogList,
  catalogSettingsGet,
  listProductCategories,
  type CatalogCreateInput,
  type CatalogProduct,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Shell,
  StoreGate,
  Loading,
  Failure,
  Field,
  ErrorSummary,
  Money,
  action,
  control,
  panel,
  useCatalogQuery,
  useRefreshCatalog,
  useDebounced,
} from "@/components/product-database/shared";
import {
  catalogError,
  duplicateDetails,
  validateCatalogBasics,
  decimalInput,
} from "@/lib/productDatabase";
import { barcodeLookupInput } from "@/lib/barcode-input";

function initialBarcode(product?: CatalogProduct) {
  if (product) return product.barcode;
  try {
    return barcodeLookupInput(
      new URLSearchParams(window.location.search).get("barcode") ?? "",
    ).barcode;
  } catch {
    return "";
  }
}

function Form({ s, product }: { s: number; product?: CatalogProduct }) {
  const submitTrigger = useRef<HTMLButtonElement>(null);
  const [, navigate] = useLocation(),
    refresh = useRefreshCatalog(s);
  const [v, setV] = useState(() => ({
    name: product?.name ?? "",
    barcode: initialBarcode(product),
    barcodeStatus: product?.barcodeStatus ?? "REAL",
    weightGrams: product?.weightGrams ?? "",
    originalPriceJpy: product?.currentCost?.originalPriceJpy ?? "",
    template: product?.defaultPricingTemplateId
      ? String(product.defaultPricingTemplateId)
      : "",
    category: product?.categoryId ? String(product.categoryId) : "",
    shipping: product?.defaultShippingProfileId
      ? String(product.defaultShippingProfileId)
      : "",
    preferredRouteLabel: product?.preferredRouteLabel ?? "",
    imageUrl: product?.imageUrl ?? "",
    internalNote: product?.internalNote ?? "",
    manualCost: "",
    defaultDepartmentStoreFeeRate: product?.defaultDepartmentStoreFeeRate ?? "",
  }));
  const [errors, setErrors] = useState<Record<string, string>>({}),
    [message, setMessage] = useState(""),
    [pending, setPending] = useState(false),
    [candidates, setCandidates] = useState<ReturnType<typeof duplicateDetails>>(
      [],
    ),
    [confirmation, setConfirmation] = useState<CatalogCreateInput | null>(null);
  const update = (key: keyof typeof v, value: string) =>
    setV((old) => ({ ...old, [key]: value }));
  const settings = useCatalogQuery(s, ["settings"], (signal) =>
      catalogSettingsGet(s, { signal }),
    ),
    categories = useCatalogQuery(s, ["categories"], (signal) =>
      listProductCategories(s, { signal }),
    );
  const raw = [v.name, v.weightGrams, v.originalPriceJpy].join("\n"),
    debounced = useDebounced(raw),
    [similarName, similarWeightGrams, similarOriginalPriceJpy] =
      debounced.split("\n");
  const similar = useCatalogQuery(
    s,
    ["similar", debounced],
    (signal) =>
      catalogList(
        s,
        {
          similarName,
          similarWeightGrams,
          similarOriginalPriceJpy,
          pageSize: "5",
          includeArchived: "true",
        },
        { signal },
      ),
    !product &&
      v.barcodeStatus === "NONE" &&
      !!similarName.trim() &&
      decimalInput(similarWeightGrams, 2) &&
      decimalInput(similarOriginalPriceJpy),
  );
  const chosen = settings.data?.templates.find(
    (t) => String(t.id) === v.template,
  );
  async function save(forceBody?: CatalogCreateInput) {
    const invalid = validateCatalogBasics({
      ...v,
      ...(product ? { originalPriceJpy: undefined } : {}),
    });
    if (
      !product &&
      chosen?.costAdjustmentMode === "MANUAL" &&
      !decimalInput(v.manualCost)
    )
      invalid.manualCost = "人工模式須填寫有效成本";
    if (
      v.defaultDepartmentStoreFeeRate &&
      !decimalInput(v.defaultDepartmentStoreFeeRate)
    )
      invalid.defaultDepartmentStoreFeeRate = "請填寫非負十進位費率或留白";
    setErrors(invalid);
    setMessage("");
    if (Object.keys(invalid).length) return;
    setPending(true);
    const metadata = {
      defaultDepartmentStoreFeeRate: v.defaultDepartmentStoreFeeRate || null,
      name: v.name,
      weightGrams: v.weightGrams,
      categoryId: v.category ? Number(v.category) : null,
      defaultPricingTemplateId: v.template ? Number(v.template) : null,
      defaultShippingProfileId: v.shipping ? Number(v.shipping) : null,
      preferredRouteLabel: v.preferredRouteLabel || null,
      imageUrl: v.imageUrl || null,
      internalNote: v.internalNote || null,
    };
    const body: CatalogCreateInput = forceBody ?? {
      ...metadata,
      barcode: v.barcodeStatus === "NONE" ? "0" : v.barcode,
      barcodeStatus: v.barcodeStatus === "NONE" ? "NONE" : "REAL",
      originalPriceJpy: v.originalPriceJpy,
      ...(chosen?.costAdjustmentMode === "RATE"
        ? { adjustmentMode: "RATE", adjustmentRate: chosen.costAdjustmentRate }
        : chosen?.costAdjustmentMode === "MANUAL"
          ? { adjustmentMode: "MANUAL", effectiveCostJpy: v.manualCost }
          : {}),
    };
    try {
      const result = product
        ? await catalogPatch(s, product.id, metadata)
        : await catalogCreate(s, body);
      await refresh();
      navigate(`/product-database/${result.product.id}`);
    } catch (e) {
      const matches = duplicateDetails(e);
      if (!product && matches.length) {
        setCandidates(matches);
        setConfirmation(body);
      } else setMessage(catalogError(e));
    } finally {
      setPending(false);
    }
  }
  return (
    <Shell title={product ? "編輯基本資料" : "新增至商品資料庫"}>
      <form
        className="mx-auto max-w-3xl space-y-6"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
        noValidate
      >
        <ErrorSummary errors={errors} message={message} />
        <section className={`${panel} space-y-4`}>
          <h2 className="text-lg font-semibold">商品識別</h2>
          <Field
            id="name"
            label="商品名稱 *"
            value={v.name}
            onChange={(x) => update("name", x)}
            error={errors.name}
            maxLength={256}
            help={
              product ? "改名後，原名稱自動保留為可搜尋的歷史名稱。" : undefined
            }
          />
          <div>
            <label htmlFor="barcode-status" className="mb-2 block text-sm">
              條碼狀態 *
            </label>
            <select
              id="barcode-status"
              className={control}
              value={v.barcodeStatus}
              disabled={!!product}
              onChange={(e) => update("barcodeStatus", e.target.value)}
            >
              <option value="REAL">有條碼</option>
              <option value="NONE">無條碼</option>
            </select>
          </div>
          <Field
            id="barcode"
            label="條碼 *"
            value={v.barcodeStatus === "NONE" ? "0" : v.barcode}
            onChange={(x) => update("barcode", x)}
            error={errors.barcode}
            inputMode="numeric"
            readOnly={!!product || v.barcodeStatus === "NONE"}
            help={
              product
                ? "條碼更正與換品複製請由詳細頁操作，保留原因及歷史。"
                : "保留開頭 0；無條碼仍可正式建立。"
            }
            maxLength={128}
          />
          <Field
            id="weightGrams"
            label="重量 g *"
            value={v.weightGrams}
            onChange={(x) => update("weightGrams", x)}
            error={errors.weightGrams}
            inputMode="decimal"
            help="最多兩位小數，例如 15.25"
          />
          <Field
            id="originalPriceJpy"
            label="日本原始售價 ¥ *"
            value={v.originalPriceJpy}
            onChange={(x) => update("originalPriceJpy", x)}
            readOnly={!!product}
            error={errors.originalPriceJpy}
            inputMode="decimal"
            help={
              product
                ? "成本歷史不可覆寫；請於詳細頁追加成本。"
                : "提交保持輸入精度，日圓畫面以 0 位小數顯示。"
            }
          />
          {!product && v.barcodeStatus === "NONE" && raw === debounced ? (
            similar.isError ? (
              <Failure
                error={similar.error}
                retry={() => void similar.refetch()}
              />
            ) : similar.data?.total ? (
              <aside
                className="space-y-2 border border-border p-4"
                aria-live="polite"
              >
                <h3 className="font-semibold">
                  找到 {similar.data.total} 筆相似的無條碼商品
                </h3>
                <p className="text-sm text-secondary-foreground">
                  名稱、重量與原價相同。僅供確認，仍可新增，不會自動合併。
                </p>
                {similar.data.items.map((p) => (
                  <p key={p.id}>
                    <Link
                      className="inline-flex min-h-11 items-center underline"
                      href={`/product-database/${p.id}`}
                    >
                      {p.name}
                    </Link>{" "}
                    · <Money value={p.currentCost?.originalPriceJpy} />
                  </p>
                ))}
              </aside>
            ) : null
          ) : null}
        </section>
        <section className={`${panel} space-y-4`}>
          <h2 className="text-lg font-semibold">預設與分類</h2>
          {settings.isError ? (
            <Failure
              error={settings.error}
              retry={() => void settings.refetch()}
            />
          ) : null}
          {categories.isError ? (
            <Failure
              error={categories.error}
              retry={() => void categories.refetch()}
            />
          ) : null}
          <label className="block text-sm" htmlFor="template">
            計價範本
          </label>
          <select
            id="template"
            className={control}
            value={v.template}
            onChange={(e) => update("template", e.target.value)}
          >
            <option value="">未指定（建立時依原價）</option>
            {settings.data?.templates
              .filter((t) => t.isActive || String(t.id) === v.template)
              .map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                  {t.isActive ? "" : "（已停用）"}
                </option>
              ))}
          </select>
          {!settings.data?.templates.length ? (
            <p className="text-sm text-secondary-foreground">
              尚未建立範本。可返回商品資料庫，在「計價設定」明確建立系統預設。
            </p>
          ) : null}
          {!product && chosen?.costAdjustmentMode === "MANUAL" ? (
            <Field
              id="manualCost"
              label="人工有效成本 ¥ *"
              value={v.manualCost}
              onChange={(x) => update("manualCost", x)}
              error={errors.manualCost}
              inputMode="decimal"
            />
          ) : null}
          <Field
            id="defaultDepartmentStoreFeeRate"
            label="百貨手續費率（留白依範本）"
            value={v.defaultDepartmentStoreFeeRate}
            onChange={(x) => update("defaultDepartmentStoreFeeRate", x)}
            error={errors.defaultDepartmentStoreFeeRate}
            inputMode="decimal"
            help={`留白時依範本，目前為 ${chosen?.departmentStoreFeeRate ?? "0"}；例如 0.0155 表示 1.55%。填值會保留為商品自訂費率。`}
          />
          <label className="block text-sm" htmlFor="category">
            分類
          </label>
          <select
            id="category"
            className={control}
            value={v.category}
            onChange={(e) => update("category", e.target.value)}
          >
            <option value="">未分類</option>
            {categories.data?.map((c) => (
              <option value={c.id} key={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <Field
            id="preferredRouteLabel"
            label="偏好路線"
            value={v.preferredRouteLabel}
            onChange={(x) => update("preferredRouteLabel", x)}
            help="記錄偏好；實際行程路線於上架時選擇。"
          />
          <label className="block text-sm" htmlFor="shipping">
            預設國際航運
          </label>
          <select
            id="shipping"
            className={control}
            value={v.shipping}
            onChange={(e) => update("shipping", e.target.value)}
          >
            <option value="">未指定</option>
            {settings.data?.shippingProfiles
              .filter((p) => p.isActive || String(p.id) === v.shipping)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.isActive ? "" : "（已停用）"}
                </option>
              ))}
          </select>
        </section>
        <section className={`${panel} space-y-4`}>
          <h2 className="text-lg font-semibold">補充資料</h2>
          <Field
            id="imageUrl"
            label="圖片網址"
            value={v.imageUrl}
            onChange={(x) => update("imageUrl", x)}
            type="url"
            help="使用 http 或 https 圖片網址。"
          />
          <label htmlFor="internalNote" className="block text-sm">
            內部備註
          </label>
          <textarea
            id="internalNote"
            className={control}
            rows={4}
            value={v.internalNote}
            onChange={(e) => update("internalNote", e.target.value)}
            maxLength={2000}
          />
        </section>
        <div className="flex flex-wrap gap-2">
          <Button
            ref={submitTrigger}
            type="submit"
            className={action}
            disabled={pending || settings.isPending || categories.isPending}
          >
            {pending ? "儲存中…" : product ? "儲存基本資料" : "新增商品"}
          </Button>
          <Button asChild variant="outline" className={action}>
            <Link
              href={
                product
                  ? `/product-database/${product.id}`
                  : "/product-database"
              }
            >
              取消
            </Link>
          </Button>
        </div>
        <p
          role="status"
          aria-live="polite"
          className="text-sm text-secondary-foreground"
        >
          {pending ? "正在儲存，請稍候。" : ""}
        </p>
      </form>
      <Dialog
        open={confirmation !== null}
        onOpenChange={(open) => {
          if (!open && !pending) setConfirmation(null);
        }}
      >
        <DialogContent
          onCloseAutoFocus={(e) => {
            if (submitTrigger.current?.isConnected) {
              e.preventDefault();
              submitTrigger.current.focus();
            }
          }}
          className="[&>button]:min-h-11 [&>button]:min-w-11"
        >
          <DialogTitle>此條碼已有商品</DialogTitle>
          <DialogDescription>
            請核對候選商品。只有明確確認後，才建立另一筆同條碼商品。
          </DialogDescription>
          <ul className="space-y-3">
            {candidates.map((c) => (
              <li key={c.id} className="break-words">
                {c.name}
                <span className="block break-all text-sm text-secondary-foreground">
                  {c.barcode}
                </span>
              </li>
            ))}
          </ul>
          <Button
            className={action}
            disabled={pending}
            onClick={() => {
              if (confirmation)
                void save({ ...confirmation, forceCreate: true });
            }}
          >
            確認另外建立
          </Button>
          <Button
            variant="outline"
            className={action}
            disabled={pending}
            onClick={() => setConfirmation(null)}
          >
            返回檢查
          </Button>
        </DialogContent>
      </Dialog>
    </Shell>
  );
}
function FormLoader({ s, id }: { s: number; id?: number }) {
  const query = useCatalogQuery(
    s,
    ["product", id],
    (signal) => catalogGet(s, id ?? 0, { signal }),
    id !== undefined && id > 0,
  );
  if (id !== undefined) {
    if (!Number.isSafeInteger(id) || id < 1)
      return (
        <Shell title="商品不存在">
          <p>網址中的商品編號無效。</p>
        </Shell>
      );
    if (query.isError)
      return <Failure error={query.error} retry={() => void query.refetch()} />;
    if (!query.data) return <Loading />;
    return <Form key={id} s={s} product={query.data.product} />;
  }
  return <Form s={s} />;
}
export default function ProductDatabaseForm({
  productId,
}: {
  productId?: number;
}) {
  return <StoreGate>{(s) => <FormLoader s={s} id={productId} />}</StoreGate>;
}
