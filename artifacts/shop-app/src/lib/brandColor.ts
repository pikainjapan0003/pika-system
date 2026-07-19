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

export function getLuminance(hex: string): number {
  const m = /^#([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return 0.5;
  const r = parseInt(m[1], 16) / 255;
  const g = parseInt(m[2], 16) / 255;
  const b = parseInt(m[3], 16) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function getContrastForeground(hex: string): "#ffffff" | "#1a1a1a" {
  return getLuminance(hex) > 0.6 ? "#1a1a1a" : "#ffffff";
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
    getLuminance(hex) > 0.6 ? "20 15% 15%" : "0 0% 100%",
  );
}
