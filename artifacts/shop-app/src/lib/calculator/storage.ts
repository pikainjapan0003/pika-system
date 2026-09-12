import { parseInput } from "./model";
export const RATE_KEY = "pika.priceCalculator.lastJpyRate";
export type RateMemory = { value: string; message: string };
export const browserStorage = () => window.localStorage;
export function readRate(
  getStorage: () => Storage = browserStorage,
): RateMemory {
  try {
    const value = getStorage().getItem(RATE_KEY) ?? "";
    if (!value) return { value: "", message: "" };
    return parseInput(value, "rate").value
      ? { value, message: "已帶入此瀏覽器上次有效匯率" }
      : { value: "", message: "記憶的匯率無效，請重新輸入" };
  } catch {
    return { value: "", message: "無法讀取匯率記憶；仍可手動試算" };
  }
}
export function saveRate(
  value: string,
  getStorage: () => Storage = browserStorage,
): string {
  if (!parseInput(value, "rate").value) return "此輸入尚未記住；請完成有效匯率";
  try {
    getStorage().setItem(RATE_KEY, value.trim());
    return "已記住此瀏覽器的有效匯率";
  } catch {
    return "本次匯率可計算，但無法儲存到此瀏覽器";
  }
}
export function removeRate(
  getStorage: () => Storage = browserStorage,
): RateMemory {
  try {
    getStorage().removeItem(RATE_KEY);
    return { value: "", message: "已清除共用匯率與瀏覽器記憶" };
  } catch {
    return {
      value: "",
      message:
        "目前共用匯率已清空，但瀏覽器記憶刪除失敗；重新載入可能讀到舊值，請重試清除",
    };
  }
}
