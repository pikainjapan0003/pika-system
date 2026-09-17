import { useEffect, useId, useRef, useState } from "react";
import { useAuth } from "@clerk/react";
import { ImagePlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { action, control } from "./shared";

type Props = {
  storeId: number;
  value: string;
  onChange: (url: string) => void;
  onUploadingChange: (uploading: boolean) => void;
  disabled?: boolean;
};

export function CatalogImageUpload({ storeId, ...props }: Props) {
  return <ImageUpload key={storeId} storeId={storeId} {...props} />;
}

function ImageUpload({
  storeId,
  value,
  onChange,
  onUploadingChange,
  disabled = false,
}: Props) {
  const { getToken } = useAuth();
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const request = useRef<AbortController | null>(null);
  const objectUrl = useRef<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [broken, setBroken] = useState(false);
  const display = preview ?? value;

  function clearPreview() {
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    objectUrl.current = null;
    setPreview(null);
  }
  useEffect(() => {
    onUploadingChange(false);
    return () => {
      request.current?.abort();
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    };
  }, [onUploadingChange]);
  useEffect(() => setBroken(false), [display]);

  async function upload(file?: File) {
    if (!file || disabled || request.current) return;
    setError("");
    setDone(false);
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setError("僅支援 JPG、PNG、WebP 圖片。");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("圖片大小不可超過 5MB。");
      return;
    }
    const controller = new AbortController();
    request.current = controller;
    clearPreview();
    objectUrl.current = URL.createObjectURL(file);
    setPreview(objectUrl.current);
    setUploading(true);
    onUploadingChange(true);
    // A stalled connection must not leave the form permanently blocked.
    const timeout = setTimeout(() => controller.abort(), 45000);
    const current = () => request.current === controller;
    try {
      const token = await getToken();
      if (controller.signal.aborted)
        throw new Error("圖片上傳已取消或逾時，請重試。");
      const body = new FormData();
      body.append("image", file);
      const response = await fetch(`/api/stores/${storeId}/products/image`, {
        method: "POST",
        body,
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        signal: controller.signal,
      });
      if (response.status === 401 || response.status === 403)
        throw new Error("沒有權限上傳圖片，請重新登入。");
      if (response.status === 429) throw new Error("上傳太頻繁，請稍後再試。");
      if (!response.ok) throw new Error("圖片上傳失敗，請稍後重試。");
      const data = (await response.json()) as { imageUrl?: string };
      if (!data.imageUrl || !/^https?:\/\//i.test(data.imageUrl))
        throw new Error("圖片上傳失敗，請稍後重試。");
      if (!current() || controller.signal.aborted) return;
      onChange(data.imageUrl);
      setDone(true);
    } catch (e) {
      if (current())
        setError(
          controller.signal.aborted
            ? "圖片上傳已取消或逾時，請重試。"
            : e instanceof Error
              ? e.message
              : "圖片上傳失敗，請稍後重試。",
        );
    } finally {
      clearTimeout(timeout);
      if (current()) {
        request.current = null;
        clearPreview();
        setUploading(false);
        onUploadingChange(false);
      }
    }
  }

  // Invalidate late replies as well as aborting the network request on unmount.
  useEffect(
    () => () => {
      request.current = null;
    },
    [],
  );

  return (
    <div className="space-y-3" aria-busy={uploading}>
      <p className="text-sm text-secondary-foreground">
        從相簿選擇商品照片，最多 1 張；支援 JPG、PNG、WebP，5MB 以內。
      </p>
      <input
        ref={input}
        id={`${id}-file`}
        aria-label="選擇商品圖片"
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        tabIndex={-1}
        disabled={disabled || uploading}
        onChange={(e) => {
          const file = e.currentTarget.files?.[0];
          e.currentTarget.value = "";
          void upload(file);
        }}
      />
      <div className="flex flex-wrap items-start gap-3">
        {display && (
          <div className="relative h-28 w-28 shrink-0 overflow-hidden rounded-xl border border-border bg-muted">
            {broken ? (
              <p className="p-3 text-sm">圖片無法顯示，可重新選擇。</p>
            ) : (
              <img
                src={display}
                alt="商品圖片預覽"
                className="h-full w-full object-cover"
                onError={() => setBroken(true)}
              />
            )}
            {uploading && (
              <span className="absolute inset-0 flex items-center justify-center bg-background/80 text-sm">
                上傳中…
              </span>
            )}
          </div>
        )}
        <Button
          type="button"
          variant="outline"
          className="h-28 w-28 shrink-0 flex-col gap-2 rounded-xl border-2 border-dashed"
          disabled={disabled || uploading}
          onClick={() => input.current?.click()}
        >
          <ImagePlus className="h-6 w-6" aria-hidden="true" />
          {display ? "更換照片" : "加入照片"}
        </Button>
        {value && (
          <Button
            type="button"
            variant="ghost"
            className={action}
            disabled={disabled || uploading}
            onClick={() => {
              clearPreview();
              onChange("");
              setDone(false);
              setError("");
            }}
          >
            <X aria-hidden="true" className="mr-1 h-4 w-4" />
            移除照片
          </Button>
        )}
      </div>
      <p role="status" className="text-sm text-secondary-foreground">
        {uploading
          ? "圖片上傳中，完成後即可儲存商品。"
          : done
            ? "圖片已上傳，儲存商品後套用。"
            : `已選擇 ${value ? 1 : 0} / 1 張`}
      </p>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <details>
        <summary className="min-h-11 cursor-pointer content-center text-sm text-secondary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          進階：直接輸入圖片網址
        </summary>
        <label htmlFor={`${id}-url`} className="mb-2 block text-sm">
          圖片網址
        </label>
        <input
          id={`${id}-url`}
          type="url"
          className={control}
          value={value}
          disabled={disabled || uploading}
          placeholder="https://..."
          maxLength={2000}
          onChange={(e) => {
            clearPreview();
            setDone(false);
            setError("");
            onChange(e.target.value);
          }}
        />
      </details>
    </div>
  );
}
