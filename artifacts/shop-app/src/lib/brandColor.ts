export const DEFAULT_BRAND_PRIMARY_COLOR = "#F57572";

export function isValidHex(s: string): boolean {
  return /^#[0-9A-Fa-f]{6}$/.test(s);
}

export function normalizeHex(s: string): string {
  const t = s.trim();
  return (t.startsWith("#") ? t : `#${t}`).toUpperCase();
}

export function safeHex(input: string): string {
  const n = normalizeHex(input);
  return isValidHex(n) ? n : DEFAULT_BRAND_PRIMARY_COLOR;
}

function hexToHsl(hex: string): string | null {
  const m = /^#([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return null;
  const r = parseInt(m[1], 16) / 255;
  const g = parseInt(m[2], 16) / 255;
  const b = parseInt(m[3], 16) / 255;
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return `0 0% ${Math.round(l * 100)}%`;
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

/**
 * WCAG 2.x 相對亮度（gamma 線性化後加權）：
 *   c_lin = c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
 *   L     = 0.2126*R_lin + 0.7152*G_lin + 0.0722*B_lin
 * 舊實作缺線性化（直接用 sRGB 通道），會把亮色誤判為深色前景需求。
 */
export function getLuminance(hex: string): number {
  const m = /^#([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return 0.5;
  const linear = (value: number) => {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const r = linear(parseInt(m[1], 16));
  const g = linear(parseInt(m[2], 16));
  const b = linear(parseInt(m[3], 16));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

const BRAND_FOREGROUND_OPTIONS = [
  { color: "#ffffff", hsl: "0 0% 100%" },
  { color: "#1a1a1a", hsl: "20 15% 15%" },
] as const;

function contrastRatio(luminanceA: number, luminanceB: number): number {
  const lighter = Math.max(luminanceA, luminanceB);
  const darker = Math.min(luminanceA, luminanceB);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * 品牌前景唯一決策點：白字與深字各算一次對比，取較高者。
 * （殘餘：某些顏色白字深字皆不足 4.5（如 #7A7A7A），仍取較高者盡力而為；
 *   警告 UI 為 Owner 乙案，本批不處理。）
 * applyBrandColor 與 getContrastForeground 都走這裡，不留第二份邏輯。
 */
export function resolveBrandForeground(hex: string): {
  color: "#ffffff" | "#1a1a1a";
  hsl: "0 0% 100%" | "20 15% 15%";
} {
  const background = getLuminance(hex);
  const white = contrastRatio(background, getLuminance("#ffffff"));
  const dark = contrastRatio(background, getLuminance("#1a1a1a"));
  return white >= dark
    ? BRAND_FOREGROUND_OPTIONS[0]
    : BRAND_FOREGROUND_OPTIONS[1];
}

export function getContrastForeground(hex: string): "#ffffff" | "#1a1a1a" {
  return resolveBrandForeground(hex).color;
}

export function applyBrandColor(hexInput: string | null | undefined): void {
  const hex = safeHex(hexInput ?? DEFAULT_BRAND_PRIMARY_COLOR);
  const hsl = hexToHsl(hex);
  if (!hsl) return;
  const root = document.documentElement;
  root.style.setProperty("--primary", hsl);
  root.style.setProperty("--ring", hsl);
  root.style.setProperty("--sidebar-primary", hsl);
  root.style.setProperty("--sidebar-ring", hsl);
  root.style.setProperty("--chart-1", hsl);
  root.style.setProperty(
    "--primary-foreground",
    resolveBrandForeground(hex).hsl,
  );
}
