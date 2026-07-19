import { useEffect, useState } from "react";

const STORAGE_PREFIX = "pickbee-receipt-preview:";
const MAX_AGE_MS = 60 * 60 * 1000; // 1 hour

interface StoredReceipt {
  html: string;
  title: string;
  createdAt: number;
}

export default function ReceiptPreview() {
  const [status, setStatus] = useState<
    "loading" | "rendering" | "expired" | "error"
  >("loading");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const key = params.get("key");

    if (!key) {
      setMsg("未提供銷貨單 key，請重新從訂單頁開啟。");
      setStatus("expired");
      return;
    }

    let data: StoredReceipt;
    try {
      const raw = localStorage.getItem(STORAGE_PREFIX + key);
      if (!raw) {
        setMsg("銷貨單資料不存在，請重新從訂單頁開啟。");
        setStatus("expired");
        return;
      }
      data = JSON.parse(raw) as StoredReceipt;
    } catch {
      setMsg("讀取銷貨單資料時發生錯誤，請重新從訂單頁開啟。");
      setStatus("error");
      return;
    }

    if (Date.now() - data.createdAt > MAX_AGE_MS) {
      try {
        localStorage.removeItem(STORAGE_PREFIX + key);
      } catch {
        /* ignore */
      }
      setMsg("銷貨單資料已過期（超過 1 小時），請重新從訂單頁開啟。");
      setStatus("expired");
      return;
    }

    // Replace the entire document with the receipt HTML.
    // This ensures iOS Chrome / Google App share / PDF captures only the receipt,
    // not the surrounding React app shell.
    setStatus("rendering");
    const { html } = data;
    setTimeout(() => {
      document.open();
      document.write(html);
      document.close();
    }, 0);
  }, []);

  const goBack = () => {
    const base = ((import.meta.env.BASE_URL as string) ?? "/").replace(
      /\/$/,
      "",
    );
    window.location.href = `${base}/orders`;
  };

  if (status === "loading" || status === "rendering") {
    return (
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          minHeight: "100dvh",
          fontFamily: "system-ui,-apple-system,sans-serif",
          background: "white",
        }}
      >
        <div
          style={{ textAlign: "center", color: "#6b7280", fontSize: "14px" }}
        >
          <div style={{ fontSize: "28px", marginBottom: "10px" }}>🐝</div>
          <p style={{ margin: 0 }}>載入銷貨單中…</p>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        minHeight: "100dvh",
        padding: "20px",
        fontFamily: "system-ui,-apple-system,sans-serif",
        background: "white",
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          maxWidth: "400px",
          width: "100%",
          textAlign: "center",
          padding: "24px",
          border: "1px solid #e5e7eb",
          borderRadius: "12px",
        }}
      >
        <div style={{ fontSize: "32px", marginBottom: "12px" }}>🐝</div>
        <p
          style={{
            fontWeight: 700,
            fontSize: "16px",
            color: "#1a1a1a",
            margin: "0 0 8px",
          }}
        >
          銷貨單資料已過期
        </p>
        <p
          style={{
            fontSize: "13px",
            color: "#6b7280",
            margin: "0 0 20px",
            lineHeight: 1.6,
          }}
        >
          {msg}
        </p>
        <button
          type="button"
          onClick={goBack}
          style={{
            background: "#fb7185",
            color: "white",
            border: "none",
            borderRadius: "8px",
            padding: "10px 24px",
            fontSize: "14px",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          ← 返回訂單頁
        </button>
      </div>
    </div>
  );
}
