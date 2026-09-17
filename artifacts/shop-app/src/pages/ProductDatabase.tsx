import { BarcodeLookup } from "@/components/product-database/BarcodeLookup";
import { useState, useRef } from "react";
import { Link } from "wouter";
import {
  catalogList,
  listProductCategories,
  type CatalogListParams,
  type CatalogProduct,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Search, Package, Plus, Settings } from "lucide-react";
import {
  Shell,
  StoreGate,
  Loading,
  Failure,
  Empty,
  Money,
  Status,
  control,
  panel,
  action,
  useCatalogQuery,
  useDebounced,
} from "@/components/product-database/shared";
import { CatalogSettingsPanel } from "@/components/product-database/SettingsPanel";
import { catalogDateLabel, formatCatalogNumber } from "@/lib/productDatabase";

const filters = [
  "全部",
  "正常",
  "店鋪停售",
  "封存",
  "有條碼",
  "無條碼",
  "可能重複",
  "成本已更新",
  "缺資料",
] as const;
function ProductCard({
  product: p,
  sale,
  onAdd,
}: {
  product: CatalogProduct;
  sale: any;
  onAdd: () => void;
}) {
  return (
    <article className={`${panel} flex flex-col gap-4`}>
      <div className="flex items-start gap-3">
        <div
          className="grid size-14 shrink-0 place-items-center border border-border bg-secondary"
          aria-hidden="true"
        >
          {p.imageUrl ? (
            <img
              src={p.imageUrl}
              alt=""
              loading="lazy"
              className="size-full object-cover"
              onError={(e) => {
                e.currentTarget.style.visibility = "hidden";
              }}
            />
          ) : (
            <Package className="size-6 text-secondary-foreground" />
          )}
        </div>
        <div className="min-w-0">
          <h2 className="break-words text-lg font-semibold">
            <Link
              href={`/product-database/${p.id}`}
              className="inline-flex min-h-11 items-center underline-offset-4 hover:underline"
            >
              {p.name}
            </Link>
          </h2>
          <p className="break-all text-sm text-secondary-foreground">
            {p.barcodeStatus === "NONE" ? "無條碼" : p.barcode}
          </p>
        </div>
      </div>
      <Status status={p.status} />
      <dl className="space-y-2 text-sm">
        {[
          ["日本原始售價", <Money value={p.currentCost?.originalPriceJpy} />],
          ["實際計價成本", <Money value={p.currentCost?.effectiveCostJpy} />],
          ["重量", `${formatCatalogNumber(p.weightGrams, 2)} g`],
        ].map(([label, value]) => (
          <div
            key={String(label)}
            className="flex flex-wrap justify-between gap-x-3 gap-y-1"
          >
            <dt className="text-secondary-foreground">{label}</dt>
            <dd className="tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
      <p className="text-xs text-secondary-foreground">
        更新 {catalogDateLabel(p.updatedAt)}
      </p>
      <div className="mt-auto flex flex-wrap gap-2">
        <Button asChild variant="outline" className={action}>
          <Link href={`/product-database/${p.id}`}>查看</Link>
        </Button>
        <Button asChild variant="outline" className={action}>
          <Link href={`/products/new?catalogId=${p.id}`}>建立上架商品</Link>
        </Button>
        <Button variant="outline" className={action} onClick={onAdd}>
          加入訂單
        </Button>
      </div>
      <SalesSummary label="一般成交" sale={sale?.general} />
      <SalesSummary label="VIP 成交" sale={sale?.vip} />
    </article>
  );
}
function Database({ s }: { s: number }) {
  const settingsTrigger = useRef<HTMLButtonElement>(null);
  const api = useOrderApi();
  const [draftCatalog, setDraftCatalog] = useState<CatalogProduct>(),
    [orderOpen, setOrderOpen] = useState(false);
  const [q, setQ] = useState(""),
    [filter, setFilter] = useState<(typeof filters)[number]>("全部"),
    [category, setCategory] = useState(""),
    [page, setPage] = useState(1),
    [settings, setSettings] = useState(false);
  const search = useDebounced(q);
  const params: CatalogListParams = {
    q: search || undefined,
    page: String(page),
    pageSize: "12",
    categoryId: category || undefined,
    ...(filter === "正常"
      ? { status: "NORMAL" as const }
      : filter === "店鋪停售"
        ? { status: "DISCONTINUED" as const }
        : filter === "封存"
          ? { status: "ARCHIVED" as const, includeArchived: "true" as const }
          : filter === "有條碼"
            ? { barcodeStatus: "REAL" as const }
            : filter === "無條碼"
              ? { barcodeStatus: "NONE" as const }
              : filter === "可能重複"
                ? { filter: "POSSIBLE_DUPLICATE" as const }
                : filter === "成本已更新"
                  ? { filter: "COST_UPDATED" as const }
                  : filter === "缺資料"
                    ? { filter: "MISSING_DATA" as const }
                    : {}),
  };
  const products = useCatalogQuery(s, ["list", params], (signal) =>
    catalogList(s, params, { signal }),
  );
  const categories = useCatalogQuery(s, ["categories"], (signal) =>
    listProductCategories(s, { signal }),
  );
  const ids = products.data?.items.map((p) => p.id).join(",") ?? "";
  const stats = useCatalogQuery(
    s,
    ["sales", ids],
    (signal) => api(`/stores/${s}/catalog-sales?ids=${ids}`, undefined, signal),
    !!ids,
  );
  return (
    <Shell
      title="商品資料庫"
      back="/products"
      actions={
        <>
          <Button asChild variant="outline" className={action}>
            <Link href="/product-database/matches">既有商品配對</Link>
          </Button>
          <Button asChild variant="outline" className={action}>
            <Link href="/product-database/import">單分頁匯入</Link>
          </Button>
          <Button
            variant="outline"
            className={action}
            ref={settingsTrigger}
            onClick={() => setSettings(true)}
          >
            <Settings aria-hidden="true" className="mr-2 size-4" />
            計價設定
          </Button>
          <Button asChild className={action}>
            <Link href="/product-database/new">
              <Plus aria-hidden="true" className="mr-2 size-4" />
              新增至商品資料庫
            </Link>
          </Button>
        </>
      }
    >
      <BarcodeLookup
        key={s}
        s={s}
        onManualSearch={() =>
          document.getElementById("catalog-search")?.focus()
        }
        renderProductActions={(p, close) => (
          <>
            <Button asChild variant="outline" className={action}>
              <Link href={`/product-database/${p.id}`} onClick={close}>
                查看
              </Link>
            </Button>
            <Button asChild variant="outline" className={action}>
              <Link href={`/products/new?catalogId=${p.id}`} onClick={close}>
                載入上架
              </Link>
            </Button>
            <Button
              type="button"
              className={action}
              onClick={() => {
                close();
                setDraftCatalog(p);
                setOrderOpen(true);
              }}
            >
              加入訂單
            </Button>
          </>
        )}
        renderCreateAction={(barcode, close) => (
          <Button asChild className={action}>
            <Link
              href={`/product-database/new?barcode=${encodeURIComponent(barcode)}`}
              onClick={close}
            >
              新增此條碼商品
            </Link>
          </Button>
        )}
      />
      <p className="mb-6 max-w-2xl text-secondary-foreground">
        保存商品原價、實際成本與歷史。每一次變更都有依據，下一次採購不用從頭整理。
      </p>
      <section aria-label="搜尋與篩選" className={`${panel} mb-6 space-y-4`}>
        <label
          htmlFor="catalog-search"
          className="flex items-center gap-2 text-sm font-medium"
        >
          <Search aria-hidden="true" className="size-4" />
          名稱、歷史名稱、條碼或分類
        </label>
        <div className="flex gap-2">
          <input
            id="catalog-search"
            className={control}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
            placeholder="例如：香水 15 ml"
          />
          <Button
            className={action}
            variant="outline"
            onClick={() => {
              setQ("");
              setPage(1);
            }}
          >
            清除
          </Button>
        </div>
        <p className="text-sm text-secondary-foreground">
          名稱搜尋與精確條碼查詢皆可使用。
        </p>
        <div className="flex flex-wrap gap-2">
          {filters.map((f) => (
            <Button
              className={action}
              key={f}
              variant={filter === f ? "default" : "outline"}
              aria-pressed={filter === f}
              onClick={() => {
                setFilter(f);
                setPage(1);
              }}
            >
              {f}
            </Button>
          ))}
        </div>
        <label className="block text-sm" htmlFor="catalog-category">
          分類
        </label>
        <select
          id="catalog-category"
          className={control}
          value={category}
          onChange={(e) => {
            setCategory(e.target.value);
            setPage(1);
          }}
        >
          <option value="">所有分類</option>
          {categories.data?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        {categories.isError ? (
          <Failure
            error={categories.error}
            retry={() => void categories.refetch()}
          />
        ) : null}
      </section>
      <div
        aria-live="polite"
        className="mb-4 text-sm text-secondary-foreground"
      >
        {q !== search || products.isFetching
          ? "搜尋中…"
          : products.data
            ? `共 ${products.data.total} 筆商品`
            : "商品資料"}
      </div>
      {products.isError ? (
        <Failure error={products.error} retry={() => void products.refetch()} />
      ) : q !== search || products.isPending ? (
        <Loading />
      ) : products.data?.items.length ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {products.data.items.map((p) => (
            <ProductCard
              key={p.id}
              product={p}
              sale={stats.data?.items.find(
                (v: any) => v.catalogProductId === p.id,
              )}
              onAdd={() => {
                setDraftCatalog(p);
                setOrderOpen(true);
              }}
            />
          ))}
        </div>
      ) : (
        <Empty>
          <h2 className="mb-2 font-semibold text-foreground">
            尚無符合條件的商品
          </h2>
          <p>調整搜尋條件，或新增第一筆商品，留下成本與名稱歷史。</p>
        </Empty>
      )}
      <nav
        aria-label="商品分頁"
        className="mt-6 flex flex-wrap items-center justify-between gap-2"
      >
        <Button
          variant="outline"
          className={action}
          disabled={page === 1 || products.isFetching}
          onClick={() => setPage((p) => p - 1)}
        >
          上一頁
        </Button>
        <span>第 {page} 頁</span>
        <Button
          variant="outline"
          className={action}
          disabled={
            !products.data ||
            page * 12 >= products.data.total ||
            products.isFetching
          }
          onClick={() => setPage((p) => p + 1)}
        >
          下一頁
        </Button>
      </nav>
      <Dialog open={settings} onOpenChange={setSettings}>
        <DialogContent
          onCloseAutoFocus={(e) => {
            if (settingsTrigger.current?.isConnected) {
              e.preventDefault();
              settingsTrigger.current.focus();
            }
          }}
          className="max-h-[85dvh] overflow-y-auto sm:max-w-2xl [&>button]:min-h-11 [&>button]:min-w-11"
        >
          <DialogTitle>計價設定</DialogTitle>
          <DialogDescription>
            預設值只供參考，請明確建立後再選用。
          </DialogDescription>
          {settings ? <CatalogSettingsPanel s={s} /> : null}
        </DialogContent>
      </Dialog>
      {stats.isError && (
        <Failure error={stats.error} retry={() => void stats.refetch()} />
      )}
      <CreateOrderDialog
        storeId={s}
        open={orderOpen}
        initialCatalog={draftCatalog}
        onClose={() => setOrderOpen(false)}
      />
    </Shell>
  );
}
export default function ProductDatabase() {
  return <StoreGate>{(s) => <Database s={s} />}</StoreGate>;
}
import { CreateOrderDialog } from "./CreateOrderDialog";
import { useOrderApi } from "@/components/product-database/OrderItemsEditor";
import { SalesSummary } from "@/components/product-database/SalesSummary";
