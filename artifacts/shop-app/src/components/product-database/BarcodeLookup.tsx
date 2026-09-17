import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useLocation } from "wouter";
import { catalogList, type CatalogProduct } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { barcodeLookupInput } from "@/lib/barcode-input";
import { startBarcodeCamera } from "@/lib/barcodeCamera";
import { action, control, panel, Status, useCatalogQuery } from "./shared";

type Input = ReturnType<typeof barcodeLookupInput>;
type Props = {
  s: number;
  onManualSearch: () => void;
  renderProductActions: (
    product: CatalogProduct,
    close: () => void,
  ) => ReactNode;
  renderCreateAction: (barcode: string, close: () => void) => ReactNode;
};
function Camera({
  onResult,
  onError,
}: {
  onResult: (input: Input) => void;
  onError: (message: string) => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const callbacks = useRef({ onResult, onError });
  callbacks.current = { onResult, onError };
  useEffect(
    () =>
      startBarcodeCamera(
        video.current!,
        (value) => callbacks.current.onResult(value),
        (message) => callbacks.current.onError(message),
      ),
    [],
  );
  return (
    <video
      ref={video}
      muted
      playsInline
      autoPlay
      aria-label="條碼相機"
      className="max-h-64 w-full rounded-md bg-black object-contain"
    />
  );
}
export function BarcodeLookup(props: Props) {
  return <Lookup key={props.s} {...props} />;
}
function Lookup({
  s,
  onManualSearch,
  renderProductActions,
  renderCreateAction,
}: Props) {
  const id = useId(),
    trigger = useRef<HTMLButtonElement>(null),
    inputRef = useRef<HTMLInputElement>(null);
  const [location] = useLocation();
  const [open, setOpen] = useState(false),
    [text, setText] = useState(""),
    [input, setInput] = useState<Input | null>(null);
  const [page, setPage] = useState(1),
    [revision, setRevision] = useState(0),
    [printed, setPrinted] = useState(""),
    [error, setError] = useState("");
  const [camera, setCamera] = useState<number | null>(null),
    nextCamera = useRef(0);
  const close = useCallback(() => {
    setCamera(null);
    setOpen(false);
    setInput(null);
    setError("");
  }, []);
  const closeAndFocus = () => {
    close();
    trigger.current?.focus();
  };
  useEffect(() => {
    close();
  }, [location, close]);
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);
  useEffect(() => {
    const stop = () => setCamera(null);
    const hidden = () => {
      if (document.visibilityState === "hidden") stop();
    };
    window.addEventListener("pagehide", stop);
    document.addEventListener("visibilitychange", hidden);
    return () => {
      window.removeEventListener("pagehide", stop);
      document.removeEventListener("visibilitychange", hidden);
    };
  }, []);
  const query = useCatalogQuery(
    s,
    ["barcode", input?.candidates, page, revision],
    async (signal) => {
      const results = await Promise.all(
        input!.candidates.map((exactBarcode) =>
          catalogList(
            s,
            {
              exactBarcode,
              includeArchived: "true",
              page: String(page),
              pageSize: "12",
            },
            { signal },
          ),
        ),
      );
      return {
        items: [
          ...new Map(
            results.flatMap((r) => r.items).map((p) => [p.id, p]),
          ).values(),
        ],
        total: results.reduce((n, r) => n + r.total, 0),
        pages: Math.max(1, ...results.map((r) => Math.ceil(r.total / 12))),
      };
    },
    open && input !== null,
  );
  function lookup(value: Input) {
    setCamera(null);
    setText(value.barcode);
    setError("");
    setPrinted(value.requiresPrintedBarcodeConfirmation ? "" : value.barcode);
    setPage(1);
    setRevision((v) => v + 1);
    setInput(value);
  }
  function manual() {
    setCamera(null);
    setInput(null);
    try {
      lookup(barcodeLookupInput(text));
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <div className="space-y-3">
      <Button
        ref={trigger}
        type="button"
        variant="outline"
        className={action}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => (open ? closeAndFocus() : setOpen(true))}
      >
        掃碼／精確條碼查詢
      </Button>
      {open && (
        <section
          id={id}
          role="region"
          aria-label="精確條碼查詢"
          className={`${panel} space-y-3`}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              e.stopPropagation();
              closeAndFocus();
            }
          }}
        >
          <div className="flex flex-wrap justify-between gap-2">
            <h3 className="font-semibold">精確條碼查詢</h3>
            <Button
              type="button"
              variant="ghost"
              className={action}
              onClick={closeAndFocus}
            >
              關閉條碼查詢
            </Button>
          </div>
          <label className="block space-y-2">
            <span>商品條碼</span>
            <input
              ref={inputRef}
              className={control}
              inputMode="numeric"
              maxLength={128}
              value={text}
              onChange={(e) => {
                setCamera(null);
                setText(e.target.value);
                setInput(null);
                setPrinted("");
                setError("");
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  manual();
                }
              }}
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <Button type="button" className={action} onClick={manual}>
              查詢條碼
            </Button>
            <Button
              type="button"
              variant="outline"
              className={action}
              onClick={() => {
                setInput(null);
                setError("");
                setPrinted("");
                setCamera(++nextCamera.current);
              }}
            >
              啟動相機
            </Button>
            {camera !== null && (
              <Button
                type="button"
                variant="outline"
                className={action}
                onClick={() => setCamera(null)}
              >
                停止相機
              </Button>
            )}
          </div>
          {camera !== null && (
            <Camera
              key={camera}
              onResult={lookup}
              onError={(message) => {
                setCamera(null);
                setError(message);
              }}
            />
          )}
          <p className="text-sm text-secondary-foreground">
            保留條碼前導 0；相機最多掃描 45 秒，也可直接手動輸入。
          </p>
          {error && <p role="alert">{error}</p>}
          <Button
            type="button"
            variant="outline"
            className={action}
            onClick={() => {
              close();
              onManualSearch();
            }}
          >
            手動搜尋名稱
          </Button>
          {input &&
            (query.isError ? (
              <div role="alert">
                <p>條碼查詢失敗，請重試。輸入已保留。</p>
                <Button
                  type="button"
                  className={action}
                  onClick={() => void query.refetch()}
                >
                  重試條碼查詢
                </Button>
              </div>
            ) : query.isFetching || !query.data ? (
              <p role="status">正在查詢條碼…</p>
            ) : (
              <>
                <p role="status">
                  共 {query.data.total} 筆候選，請確認後選擇操作。
                </p>
                {query.data.items.map((p) => (
                  <article
                    key={p.id}
                    className="space-y-2 border-t border-border pt-3"
                  >
                    <h4 className="break-words font-semibold">{p.name}</h4>
                    <p className="break-all">{p.barcode}</p>
                    <Status status={p.status} />
                    <div className="flex flex-wrap gap-2">
                      {renderProductActions(p, close)}
                    </div>
                  </article>
                ))}
                {query.data.total === 0 && (
                  <div className="space-y-3">
                    <p>找不到此條碼的商品。</p>
                    {input.requiresPrintedBarcodeConfirmation && (
                      <fieldset>
                        <legend>請確認包裝上印刷的條碼</legend>
                        {input.candidates.map((code) => (
                          <label
                            key={code}
                            className="flex min-h-11 items-center gap-2"
                          >
                            <input
                              type="radio"
                              name={`${id}-printed`}
                              value={code}
                              checked={printed === code}
                              onChange={() => setPrinted(code)}
                            />
                            {code}
                          </label>
                        ))}
                      </fieldset>
                    )}
                    {printed ? (
                      renderCreateAction(printed, close)
                    ) : (
                      <p>選擇印刷條碼後，才能新增商品。</p>
                    )}
                  </div>
                )}
                {query.data.pages > 1 && (
                  <nav
                    aria-label="條碼候選分頁"
                    className="flex flex-wrap items-center gap-2"
                  >
                    <Button
                      type="button"
                      variant="outline"
                      className={action}
                      disabled={page <= 1}
                      onClick={() => setPage((p) => p - 1)}
                    >
                      上一頁候選
                    </Button>
                    <span>
                      第 {page} / {query.data.pages} 頁
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      className={action}
                      disabled={page >= query.data.pages}
                      onClick={() => setPage((p) => p + 1)}
                    >
                      下一頁候選
                    </Button>
                  </nav>
                )}
              </>
            ))}
        </section>
      )}
    </div>
  );
}
