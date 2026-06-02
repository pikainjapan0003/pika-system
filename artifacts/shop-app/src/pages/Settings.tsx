import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useGetMyStore, useUpdateStore, getGetMyStoreQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { BottomNav } from "./Dashboard";
import {
  DEFAULT_BRAND_PRIMARY_COLOR,
  isValidHex,
  normalizeHex,
  safeHex,
  getContrastForeground,
  applyBrandColor,
} from "@/lib/brandColor";

const IS_DEV = import.meta.env.DEV;

const PRESET_COLORS = [
  "#F57572", "#EF4444", "#F97316", "#F59E0B",
  "#10B981", "#06B6D4", "#3B82F6", "#8B5CF6", "#111827",
];

export default function SettingsPage() {
  const qc = useQueryClient();
  const { data: store, isLoading } = useGetMyStore();
  const updateStore = useUpdateStore();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const [brandColor, setBrandColor] = useState(DEFAULT_BRAND_PRIMARY_COLOR);
  const [colorError, setColorError] = useState("");
  const storeInitialized = useRef(false);

  useEffect(() => {
    if (store && !storeInitialized.current) {
      storeInitialized.current = true;
      setName(store.name);
      setDescription(store.description ?? "");
      const savedColor = store.brandPrimaryColor ?? DEFAULT_BRAND_PRIMARY_COLOR;
      setBrandColor(savedColor);
      applyBrandColor(savedColor);
    }
  }, [store]);

  const handleBrandColorChange = (value: string) => {
    setBrandColor(value);
    setColorError("");
    const n = normalizeHex(value);
    if (isValidHex(n)) applyBrandColor(n);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setColorError("");
    setSaved(false);
    if (!name.trim()) {
      setError("店鋪名稱不能空白");
      return;
    }
    const normalizedColor = normalizeHex(brandColor);
    if (!isValidHex(normalizedColor)) {
      setColorError("請輸入有效的 6 位 HEX 色碼，例如 #F57572");
      return;
    }
    if (!store) return;
    try {
      await updateStore.mutateAsync({
        storeId: store.id,
        data: {
          name: name.trim(),
          description: description.trim() || undefined,
          brandPrimaryColor: normalizedColor,
        },
      });
      applyBrandColor(normalizedColor);
      qc.invalidateQueries({ queryKey: getGetMyStoreQueryKey() });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err: any) {
      setError(err?.data?.error ?? "儲存失敗，請稍後再試");
    }
  };

  const previewHex = safeHex(brandColor);
  const previewFg = getContrastForeground(previewHex);

  return (
    <div className="min-h-[100dvh] bg-background max-w-[480px] mx-auto pb-24">
      <header className="bg-white border-b border-border px-5 pt-10 pb-4 sticky top-0 z-10">
        <h1 className="text-lg font-bold text-foreground">店鋪設定</h1>
      </header>

      <div className="px-5 py-5">
        {isLoading ? (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">
                店鋪名稱
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={inputClass}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">
                網址代碼
              </label>
              <div className="h-12 px-4 rounded-xl border border-input bg-secondary text-muted-foreground flex items-center text-sm">
                {store?.slug}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                網址代碼由系統自動產生，未來將開放修改。
              </p>
            </div>

            <ProductLinkInfo />

            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">
                店鋪簡介（選填）
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                placeholder="簡單介紹您的店鋪..."
                className={`${inputClass} h-auto resize-none py-3`}
              />
            </div>

            {/* 品牌顏色 */}
            <div className="bg-white rounded-2xl border border-border overflow-hidden">
              <div className="px-5 pt-5 pb-2">
                <h2 className="text-sm font-bold text-foreground">品牌顏色</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  設定後會影響後台主要按鈕、重點文字與公開頁品牌色。
                </p>
              </div>
              <div className="px-5 pb-5 space-y-4">

                {/* Current color swatch */}
                <div className="flex items-center gap-3">
                  <div
                    className="w-10 h-10 rounded-xl border border-border shrink-0"
                    style={{ backgroundColor: previewHex }}
                  />
                  <span className="text-sm font-mono font-medium text-foreground">{previewHex}</span>
                </div>

                {/* Custom color picker */}
                <div>
                  <div className="text-xs text-muted-foreground mb-2">自訂調色盤</div>
                  <ColorPicker hex={brandColor} onChange={handleBrandColorChange} />
                </div>

                {/* Preset palette */}
                <div>
                  <div className="text-xs text-muted-foreground mb-2">預設色盤</div>
                  <div className="flex flex-wrap gap-2">
                    {PRESET_COLORS.map((hex) => (
                      <button
                        key={hex}
                        type="button"
                        onClick={() => handleBrandColorChange(hex)}
                        className="w-9 h-9 rounded-full flex items-center justify-center transition-transform hover:scale-110 shrink-0"
                        style={{
                          backgroundColor: hex,
                          boxShadow: previewHex === hex
                            ? "0 0 0 2px white, 0 0 0 4px #111827"
                            : "0 1px 3px rgba(0,0,0,0.2)",
                        }}
                      >
                        {previewHex === hex && (
                          <span style={{ color: getContrastForeground(hex), fontSize: 13, fontWeight: 700 }}>✓</span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>

                {/* HEX input */}
                <div>
                  <div className="text-xs text-muted-foreground mb-1.5">自訂 HEX 色碼</div>
                  <input
                    type="text"
                    value={brandColor}
                    onChange={(e) => handleBrandColorChange(e.target.value)}
                    placeholder="#F57572"
                    maxLength={7}
                    className={inputClass}
                  />
                  {colorError && (
                    <p className="text-xs text-destructive mt-1">{colorError}</p>
                  )}
                </div>

                {/* Preview */}
                <div>
                  <div className="text-xs text-muted-foreground mb-2">預覽</div>
                  <div className="flex items-center gap-3 flex-wrap">
                    <button
                      type="button"
                      className="h-9 px-4 rounded-xl text-sm font-semibold"
                      style={{ backgroundColor: previewHex, color: previewFg }}
                    >
                      主要按鈕
                    </button>
                    <span className="text-sm font-semibold" style={{ color: previewHex }}>
                      文字連結
                    </span>
                    <span
                      className="text-xs px-2.5 py-1 rounded-full font-medium"
                      style={{ backgroundColor: previewHex + "22", color: previewHex }}
                    >
                      標籤
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {error && (
              <div className="bg-destructive/10 text-destructive text-sm px-4 py-3 rounded-xl">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={updateStore.isPending}
              className="w-full h-12 bg-primary text-white font-semibold rounded-xl text-base disabled:opacity-60"
            >
              {saved ? "已儲存！" : updateStore.isPending ? "儲存中..." : "儲存設定"}
            </button>
          </form>
        )}
      </div>

      {IS_DEV && <DevHandoffEntry />}

      <BottomNav active="settings" />
    </div>
  );
}

function DevHandoffEntry() {
  const [, setLocation] = useLocation();
  return (
    <div className="px-5 pb-3">
      <button
        type="button"
        onClick={() => setLocation("/dev/handoff")}
        className="w-full bg-white border border-border rounded-2xl px-4 py-4 flex items-center justify-between text-left hover:bg-secondary/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="w-9 h-9 rounded-xl bg-yellow-100 flex items-center justify-center text-lg flex-shrink-0">
            📋
          </span>
          <div>
            <p className="text-sm font-semibold text-foreground">研發中繼剪貼板</p>
            <p className="text-xs text-muted-foreground">Claude Handoff / Codex Copy Center</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold bg-yellow-400 text-yellow-900 px-1.5 py-0.5 rounded-full">
            DEV
          </span>
          <span className="text-muted-foreground text-sm">›</span>
        </div>
      </button>
    </div>
  );
}

function ProductLinkInfo() {
  const origin = window.location.origin;
  const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
  return (
    <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 space-y-2">
      <p className="text-sm font-medium text-blue-900">商品公開連結說明</p>
      <p className="text-xs text-blue-700 leading-relaxed">
        每個商品都有自己的下單連結，格式如下：
      </p>
      <div className="bg-white border border-blue-100 rounded-lg px-3 py-2">
        <p className="text-xs text-foreground font-mono break-all">
          {origin}{basePath}/p/&#123;商品追蹤碼&#125;
        </p>
      </div>
      <p className="text-xs text-blue-700 leading-relaxed">
        你可以在「商品管理」頁面複製每個商品的下單連結，傳給買家下單。
      </p>
    </div>
  );
}

// ---- Color picker math helpers ----

function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  const hi = Math.floor(h / 60) % 6;
  const f = h / 60 - Math.floor(h / 60);
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);
  let r: number, g: number, b: number;
  if (hi === 0)      { r = v; g = t; b = p; }
  else if (hi === 1) { r = q; g = v; b = p; }
  else if (hi === 2) { r = p; g = v; b = t; }
  else if (hi === 3) { r = p; g = q; b = v; }
  else if (hi === 4) { r = t; g = p; b = v; }
  else               { r = v; g = p; b = q; }
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

function hsvToHex(h: number, s: number, v: number): string {
  const [r, g, b] = hsvToRgb(h, s, v);
  return "#" + [r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("").toUpperCase();
}

function hexToHsv(hex: string): { h: number; s: number; v: number } {
  const m = /^#([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return { h: 0, s: 0, v: 1 };
  const r = parseInt(m[1], 16) / 255;
  const g = parseInt(m[2], 16) / 255;
  const b = parseInt(m[3], 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
    else if (max === g) h = ((b - r) / d + 2) * 60;
    else h = ((r - g) / d + 4) * 60;
  }
  const s = max === 0 ? 0 : d / max;
  return { h: Math.round(h) % 360, s, v: max };
}

// ---- ColorPicker component ----

interface ColorPickerProps {
  hex: string;
  onChange: (hex: string) => void;
}

function ColorPicker({ hex, onChange }: ColorPickerProps) {
  const interacting = useRef(false);
  const [hsv, setHsv] = useState<{ h: number; s: number; v: number }>(
    () => hexToHsv(safeHex(hex))
  );
  const hsvRef = useRef(hsv);

  useEffect(() => {
    if (interacting.current) return;
    const next = hexToHsv(safeHex(hex));
    setHsv(next);
    hsvRef.current = next;
  }, [hex]);

  const emit = (next: { h: number; s: number; v: number }) => {
    setHsv(next);
    hsvRef.current = next;
    onChange(hsvToHex(next.h, next.s, next.v));
  };

  // Saturation / Value panel
  const calcPanel = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const s = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const v = Math.max(0, Math.min(1, 1 - (e.clientY - rect.top) / rect.height));
    emit({ ...hsvRef.current, s, v });
  };
  const onPanelDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    interacting.current = true;
    calcPanel(e);
  };
  const onPanelMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!interacting.current) return;
    calcPanel(e);
  };
  const onPanelUp = () => { interacting.current = false; };

  // Hue bar
  const calcHue = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const h = Math.round(x * 360) % 360;
    emit({ ...hsvRef.current, h });
  };
  const onHueDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    interacting.current = true;
    calcHue(e);
  };
  const onHueMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!interacting.current) return;
    calcHue(e);
  };
  const onHueUp = () => { interacting.current = false; };

  const pureHueHex = hsvToHex(hsv.h, 1, 1);

  return (
    <div className="space-y-2.5">
      {/* Saturation / Value panel */}
      <div
        onPointerDown={onPanelDown}
        onPointerMove={onPanelMove}
        onPointerUp={onPanelUp}
        onPointerCancel={onPanelUp}
        role="slider"
        aria-label="選擇飽和度與明度"
        className="relative w-full rounded-xl overflow-hidden select-none touch-none"
        style={{ height: 140, cursor: "crosshair" }}
      >
        <div className="absolute inset-0" style={{ backgroundColor: pureHueHex }} />
        <div
          className="absolute inset-0"
          style={{ background: "linear-gradient(to right, #ffffff, transparent)" }}
        />
        <div
          className="absolute inset-0"
          style={{ background: "linear-gradient(to bottom, transparent, #000000)" }}
        />
        {/* Cursor marker */}
        <div
          className="absolute pointer-events-none"
          style={{
            left: `${hsv.s * 100}%`,
            top: `${(1 - hsv.v) * 100}%`,
            transform: "translate(-50%, -50%)",
          }}
        >
          <div
            className="w-4 h-4 rounded-full border-2 border-white"
            style={{ boxShadow: "0 0 0 1.5px rgba(0,0,0,0.5)" }}
          />
        </div>
      </div>

      {/* Hue bar */}
      <div
        onPointerDown={onHueDown}
        onPointerMove={onHueMove}
        onPointerUp={onHueUp}
        onPointerCancel={onHueUp}
        role="slider"
        aria-label="選擇色相"
        className="relative w-full rounded-full select-none touch-none"
        style={{
          height: 16,
          cursor: "pointer",
          background:
            "linear-gradient(to right,#ff0000,#ffff00,#00ff00,#00ffff,#0000ff,#ff00ff,#ff0000)",
        }}
      >
        {/* Hue marker */}
        <div
          className="absolute pointer-events-none"
          style={{
            left: `${(hsv.h / 360) * 100}%`,
            top: "50%",
            transform: "translate(-50%, -50%)",
          }}
        >
          <div
            className="w-5 h-5 rounded-full border-2 border-white"
            style={{
              backgroundColor: `hsl(${hsv.h},100%,50%)`,
              boxShadow: "0 0 0 1.5px rgba(0,0,0,0.4)",
            }}
          />
        </div>
      </div>
    </div>
  );
}

const inputClass =
  "w-full h-12 px-4 rounded-xl border border-input bg-white text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 text-base";
