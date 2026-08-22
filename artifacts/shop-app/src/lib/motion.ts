/**
 * G5 動效共用模組（僅 import 實際用到的 GSAP 能力）
 *
 * 禁止整包引入（gsap 的 all 入口）；本檔只註冊本關實際使用的四個入口：
 *   - gsap（core，Timeline 進場交錯／K1 結算編排）
 *   - ScrollTrigger（② 延後播放觸發器，不做 parallax／pin／scrub）
 *   - Flip（③ K3 展開收合、K7 狀態轉換）
 *   - SplitText（④ K1 數字結算逐位過渡，只允許金額）
 *
 * jsdom（node:test）沒有 window.matchMedia，且沒有真實 layout／scroll：
 * 所有動效一律先過 prefersReducedMotion()，unavailable 或 reduce 時
 * 直接回傳最終狀態（一律保留文字、符號與狀態），完全不掛 ticker。
 * 這同時保護 F-10 的 jsdom 掛鐘（15,000ms）不被動效拖累。
 *
 * ⚠️ 全部 GSAP 模組採「動態載入」：
 *    1. registerPlugin 必須延遲到瀏覽器環境（ScrollTrigger 註冊會讀
 *       window.matchMedia，jsdom 沒有它會直接拋錯）；
 *    2. node:test 的 --experimental-test-module-mocks 會用 CJS 載入
 *       gsap 的 ESM .js（無 type:module），頂層 import 會 SyntaxError；
 *       動態 import 只在 browser 且非 reduced-motion 時發生，測試永不載入。
 */

let gsapRef: typeof import("gsap") | null = null;
let ScrollTriggerRef: typeof import("gsap/ScrollTrigger") | null = null;
let FlipRef: typeof import("gsap/Flip") | null = null;
let SplitTextRef: typeof import("gsap/SplitText") | null = null;

/** 瀏覽器且使用者未要求減少動態時，載入並註冊 GSAP（一次性）。 */
export async function loadMotion() {
  if (motionEnabled()) {
    if (!gsapRef) gsapRef = await import("gsap");
    if (!ScrollTriggerRef)
      ScrollTriggerRef = await import("gsap/ScrollTrigger");
    if (!FlipRef) FlipRef = await import("gsap/Flip");
    if (!SplitTextRef) SplitTextRef = await import("gsap/SplitText");
    gsapRef.gsap.registerPlugin(
      ScrollTriggerRef.ScrollTrigger,
      FlipRef.Flip,
      SplitTextRef.SplitText,
    );
  }
  return {
    gsap: gsapRef?.gsap ?? null,
    ScrollTrigger: ScrollTriggerRef?.ScrollTrigger ?? null,
    Flip: FlipRef?.Flip ?? null,
    SplitText: SplitTextRef?.SplitText ?? null,
    enabled: motionEnabled(),
  };
}

/** DESIGN.md L326：所有動效尊重 prefers-reduced-motion。 */
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return true;
  if (
    typeof window.matchMedia !== "function" ||
    typeof window.matchMedia("(prefers-reduced-motion: reduce)").matches !==
      "boolean"
  ) {
    // jsdom 等測試環境：動效不可執行
    return true;
  }
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** 動效是否可執行（瀏覽器 ＋ 使用者未要求減少動態）。 */
export function motionEnabled(): boolean {
  return !prefersReducedMotion();
}

/**
 * K 類動效共用時長（唯一規格來源：DESIGN.md K 類表，不得自訂）
 * 卡片/區塊進場屬「低調交錯」，另用短曲線（見各呼叫處）。
 */
export const K_DURATION = {
  /** K1 數字結算 450–600ms（取中值 520ms） */
  settle: 0.52,
  /** K3 展開收合 220–300ms（取 250ms） */
  expand: 0.25,
  /** K5 進度填入 600–700ms（取 640ms） */
  fill: 0.64,
  /** K7 落印（K09 專用實例）≈ 240ms，ease-out */
  stamp: 0.24,
} as const;

/** review-animations：UI 一律 ease-out，不用 ease-in；交錯間隔 30–80ms。 */
export const PIKA_EASE = {
  uiOut: "power2.out",
  strongOut: "cubic-bezier(0.23, 1, 0.32, 1)",
  inOut: "power2.inOut",
} as const;
