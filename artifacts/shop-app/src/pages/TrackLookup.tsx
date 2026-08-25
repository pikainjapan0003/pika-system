import { useState } from "react";
import { useLocation } from "wouter";
import { Search } from "lucide-react";

export default function TrackLookupPage() {
  const [token, setToken] = useState("");
  const [error, setError] = useState("");
  const [, setLocation] = useLocation();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = token.trim();
    if (!trimmed) {
      setError("請輸入追蹤碼");
      return;
    }
    setLocation(`/track/${trimmed}`);
  };

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-5">
      <div className="max-w-sm w-full">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4 text-3xl">
            <Search className="size-7 text-primary" aria-hidden="true" />
          </div>
          <h1 className="text-xl font-bold text-foreground">查詢訂單狀態</h1>
          <p className="text-muted-foreground text-sm mt-2">
            輸入下單時收到的追蹤碼
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <label htmlFor="order-tracking-code" className="sr-only">
            訂單追蹤碼
          </label>
          <input
            id="order-tracking-code"
            type="text"
            value={token}
            onChange={(e) => {
              setToken(e.target.value);
              setError("");
            }}
            placeholder="貼上追蹤碼..."
            className="w-full h-12 px-4 rounded-xl border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 text-sm font-mono"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? "tracking-code-error" : undefined}
          />
          {error && (
            <p
              id="tracking-code-error"
              className="text-destructive text-sm"
              role="alert"
            >
              查詢尚未送出：{error}。
            </p>
          )}
          <button
            type="submit"
            className="w-full h-12 bg-primary text-primary-foreground font-semibold rounded-xl text-base"
          >
            查詢
          </button>
        </form>

        <p className="text-xs text-muted-foreground text-center mt-6 leading-relaxed">
          追蹤碼顯示於下單成功頁面，
          <br />
          請截圖或複製保存。
        </p>
      </div>
    </div>
  );
}
