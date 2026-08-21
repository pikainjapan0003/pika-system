import assert from "node:assert/strict";
import test from "node:test";

import {
  applyBrandColor,
  DEFAULT_BRAND_PRIMARY_COLOR,
  getContrastForeground,
  getLuminance,
} from "./brandColor.ts";

function contrastWith(hex, foregroundHex) {
  const background = getLuminance(hex);
  const foreground = getLuminance(foregroundHex);
  const lighter = Math.max(background, foreground);
  const darker = Math.min(background, foreground);
  return (lighter + 0.05) / (darker + 0.05);
}

// 審批者 B 獨立計算的實測基準（數值固定，不得調整測試就範）
const CASES = [
  {
    hex: "#F57572",
    luminance: 0.3335,
    white: 2.74,
    dark: 6.36,
    choice: "#1a1a1a",
  },
  { hex: "#FFFFFF", luminance: 1, white: 1, dark: 17.4, choice: "#1a1a1a" },
  { hex: "#000000", luminance: 0, white: 21, dark: 1.21, choice: "#ffffff" },
  {
    hex: "#2E5C6B",
    luminance: 0.093,
    white: 7.34,
    dark: 2.37,
    choice: "#ffffff",
  },
  {
    hex: "#FFD400",
    luminance: 0.6835,
    white: 1.43,
    dark: 12.16,
    choice: "#1a1a1a",
  },
  {
    hex: "#C0526C",
    luminance: 0.1832,
    white: 4.5,
    dark: 3.87,
    choice: "#ffffff",
  },
  {
    hex: "#7A7A7A",
    luminance: 0.1946,
    white: 4.29,
    dark: 4.05,
    choice: "#ffffff",
  },
];

test("WCAG relative luminance and best-contrast foreground baselines", () => {
  for (const c of CASES) {
    const actualLuminance = Number(getLuminance(c.hex).toFixed(4));
    assert.equal(actualLuminance, c.luminance, `${c.hex} luminance`);
    const white = Number(contrastWith(c.hex, "#ffffff").toFixed(2));
    const dark = Number(contrastWith(c.hex, "#1a1a1a").toFixed(2));
    assert.equal(white, c.white, `${c.hex} white contrast`);
    assert.equal(dark, c.dark, `${c.hex} dark contrast`);
    assert.equal(getContrastForeground(c.hex), c.choice, `${c.hex} choice`);
  }
});

test("#F57572 default brand now resolves to the dark foreground", () => {
  assert.equal(getContrastForeground(DEFAULT_BRAND_PRIMARY_COLOR), "#1a1a1a");
});

test("applyBrandColor sets the dark primary-foreground group for #F57572", () => {
  const properties = new Map();
  globalThis.document = {
    documentElement: {
      style: {
        setProperty: (key, value) => {
          properties.set(key, value);
        },
      },
    },
  };
  try {
    applyBrandColor("#F57572");
    assert.equal(properties.get("--primary-foreground"), "20 15% 15%");
    applyBrandColor(null);
    assert.equal(properties.get("--primary-foreground"), "20 15% 15%");
    applyBrandColor("#000000");
    assert.equal(properties.get("--primary-foreground"), "0 0% 100%");
    applyBrandColor("#FFFFFF");
    assert.equal(properties.get("--primary-foreground"), "20 15% 15%");
  } finally {
    delete globalThis.document;
  }
});
