/**
 * 7-11 交貨便貨態查詢 adapter（POC）
 *
 * 定位：半自動。自動查詢 + retry，OCR 失敗時回明確 errorCode 供上層排入
 * exception queue / 人工 fallback。不保證全自動。
 *
 * 設計參考：
 * - NCNU-OpenSource/parcel-tracker seven_eleven.py（flow / parser / retry 主架構）
 * - ThanatosDi/E-Tracking（captcha 影像前處理概念）
 *
 * 本檔不寫 DB、不接正式 worker、不呼叫 /internal/agent/shipment-events。
 * OCR 以可注入方式設計（deps.solveCaptcha），預設實作以 resolveTesseractBinary 找 binary。
 */

import { existsSync } from "node:fs";
import { execSync } from "node:child_process";
import type {
  NormalizedTrackingStatus,
  TrackingAdapterErrorCode,
  TrackingAdapterResult,
} from "./types.ts";

// Known nix store paths for tesseract, checked in order after TESSERACT_BIN env var.
// These hashes are specific to the Replit workspace nix store and may not exist in
// the Published deployment container (built from modules = ["nodejs-24"] only).
const TESSERACT_KNOWN_PATHS = [
  "/nix/store/44vcjbcy1p2yhc974bcw250k2r5x5cpa-tesseract-5.3.4/bin/tesseract",
  "/nix/store/nprhbhaa9j23xm07hvl3fw27mm81nl1z-tesseract-5.3.4/bin/tesseract",
  "/nix/store/89jwgijqcyl56r4h3vwv6v5dprd7xnr9-tesseract-3.05.00/bin/tesseract",
];

/**
 * Resolve tesseract binary path. Priority:
 * 1. TESSERACT_BIN env var (set this in Replit deployment secrets to fix Published runtime)
 * 2. Known nix store paths (first that exists — workspace/preview only)
 * 3. PATH-based `which tesseract` (works if tesseract is installed in system PATH)
 * 4. Bare "tesseract" (last resort; ENOENT if not installed — Published deployment fails here)
 *
 * Published deployment fix: add tesseract to replit.nix, or set TESSERACT_BIN in
 * Replit deployment environment variables, then re-publish.
 */
export function resolveTesseractBinary(): string {
  const envBin = process.env.TESSERACT_BIN;
  if (envBin) return envBin;
  for (const p of TESSERACT_KNOWN_PATHS) {
    if (existsSync(p)) return p;
  }
  // PATH-based fallback: covers environments where tesseract is installed but
  // not at any known nix store path (e.g. Docker images, apt-installed tesseract).
  try {
    const found = execSync("which tesseract", {
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 2000,
    })
      .toString()
      .trim();
    if (found) return found;
  } catch {
    // tesseract not in PATH
  }
  // Bare fallback — will ENOENT in Published deployment without tesseract.
  // To fix: set TESSERACT_BIN=/path/to/tesseract in Replit deployment env vars,
  // or create replit.nix with tesseract package, then re-publish.
  return "tesseract";
}

const BASE_URL = "https://eservice.7-11.com.tw/e-tracking/";
const SEARCH_URL = `${BASE_URL}search.aspx`;
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

export type SevenElevenErrorCode =
  | "OCR_FAILED"
  | "VERIFY_FAILED"
  | "NO_RESULT"
  | "PARSER_FAILED"
  | "NETWORK_FAILED"
  | "REMOTE_CHANGED"
  | "UNKNOWN_ERROR";

export interface SevenElevenEvent {
  occurredAt: string | null;
  statusText: string;
  rawText: string;
}

export type SevenElevenTrackingResult =
  | {
      ok: true;
      provider: "711";
      trackingCode: string;
      latestStatus: string;
      pickupStoreName?: string;
      pickupDeadline?: string;
      paymentInfo?: string;
      events: SevenElevenEvent[];
      rawSummary?: Record<string, unknown>;
    }
  | {
      ok: false;
      provider: "711";
      trackingCode: string;
      errorCode: SevenElevenErrorCode;
      message: string;
      attempts: number;
    };

/**
 * 解析驗證碼圖片成數字字串。傳入原始 JPEG bytes，回傳辨識結果（可能為空）。
 * 注入此函式即可替換 OCR 實作（測試 / 正式環境差異）。
 */
export type CaptchaSolver = (imageBytes: Uint8Array) => Promise<string>;

export interface SevenElevenDeps {
  solveCaptcha?: CaptchaSolver;
  fetchImpl?: typeof fetch;
}

interface ParsedResponse {
  kind: "success" | "captcha_error" | "no_result" | "parser_failed";
  message?: string;
  info: Record<string, string>;
  mNews: string;
  shipping: string[];
}

/** 主要進入點 */
export async function trackSevenElevenShipment(
  input: { trackingCode: string; maxAttempts?: number },
  deps: SevenElevenDeps = {},
): Promise<SevenElevenTrackingResult> {
  const trackingCode = input.trackingCode.trim();
  const maxAttempts = input.maxAttempts ?? 6;
  const provider = "711" as const;
  const doFetch = deps.fetchImpl ?? fetch;
  const solveCaptcha = deps.solveCaptcha ?? defaultTesseractSolver;

  if (!isValidOrderId(trackingCode)) {
    return {
      ok: false,
      provider,
      trackingCode,
      errorCode: "NO_RESULT",
      message: `Invalid tracking code length: ${trackingCode.length}`,
      attempts: 0,
    };
  }

  let attempts = 0;
  let lastError: SevenElevenErrorCode = "UNKNOWN_ERROR";
  let lastMessage = "no attempt executed";

  while (attempts < maxAttempts) {
    attempts += 1;
    try {
      // 1. GET search.aspx（取 cookie + viewstate + captcha url）
      const getRes = await doFetch(SEARCH_URL, {
        headers: { "User-Agent": USER_AGENT },
      });
      if (!getRes.ok) {
        lastError = "NETWORK_FAILED";
        lastMessage = `GET search.aspx HTTP ${getRes.status}`;
        continue;
      }
      const cookie = collectCookies(getRes);
      const html = await getRes.text();

      const viewState = extractInputValue(html, "__VIEWSTATE");
      const viewStateGenerator = extractInputValue(
        html,
        "__VIEWSTATEGENERATOR",
      );
      if (!viewState || !viewStateGenerator) {
        lastError = "REMOTE_CHANGED";
        lastMessage = "Missing __VIEWSTATE / __VIEWSTATEGENERATOR";
        continue;
      }

      const captchaUrl = extractCaptchaUrl(html);
      if (!captchaUrl) {
        lastError = "REMOTE_CHANGED";
        lastMessage = "Missing ValidateImage url";
        continue;
      }

      // 2. 下載 captcha 並 OCR
      const imgRes = await doFetch(captchaUrl, {
        headers: {
          "User-Agent": USER_AGENT,
          Cookie: cookie,
          Referer: SEARCH_URL,
        },
      });
      if (!imgRes.ok) {
        lastError = "NETWORK_FAILED";
        lastMessage = `GET ValidateImage HTTP ${imgRes.status}`;
        continue;
      }
      const imageBytes = new Uint8Array(await imgRes.arrayBuffer());

      let code = "";
      try {
        code = (await solveCaptcha(imageBytes)).replace(/\D/g, "");
      } catch (err) {
        lastError = "OCR_FAILED";
        lastMessage = `solveCaptcha threw: ${errMessage(err)}`;
        continue;
      }
      if (code.length !== 4) {
        lastError = "OCR_FAILED";
        lastMessage = `OCR produced non-4-digit code: "${code}"`;
        continue;
      }

      // 3. POST search.aspx
      const payload = new URLSearchParams({
        __EVENTTARGET: "submit",
        __EVENTARGUMENT: "",
        __VIEWSTATE: viewState,
        __VIEWSTATEGENERATOR: viewStateGenerator,
        txtProductNum: trackingCode,
        tbChkCode: code,
        txtIMGName: "",
        txtPage: "1",
      });
      const postRes = await doFetch(SEARCH_URL, {
        method: "POST",
        headers: {
          "User-Agent": USER_AGENT,
          Cookie: cookie,
          Referer: SEARCH_URL,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: payload.toString(),
      });
      if (!postRes.ok) {
        lastError = "NETWORK_FAILED";
        lastMessage = `POST search.aspx HTTP ${postRes.status}`;
        continue;
      }
      const resultHtml = await postRes.text();

      // 4. parse + 判斷成功（不可只看 HTTP 200）
      const parsed = parseResponse(resultHtml);
      if (parsed.kind === "captcha_error") {
        lastError = "VERIFY_FAILED";
        lastMessage = parsed.message ?? "captcha rejected";
        continue;
      }
      if (parsed.kind === "no_result") {
        lastError = "NO_RESULT";
        lastMessage = parsed.message ?? "no tracking record";
        continue;
      }
      if (parsed.kind === "parser_failed") {
        lastError = "PARSER_FAILED";
        lastMessage = parsed.message ?? "parser found no structured data";
        continue;
      }

      // 5. 防假成功：query_no 必須對應 trackingCode，events 非空
      const queryNo = parsed.info["query_no"] ?? "";
      const events = buildEvents(parsed.shipping);
      const matchesCode =
        queryNo === trackingCode || resultHtml.includes(trackingCode);
      if (!matchesCode || events.length === 0) {
        lastError = "PARSER_FAILED";
        lastMessage = `success page but query_no="${queryNo}" not matching or no events`;
        continue;
      }

      const latestStatus = extractLatestStatus(parsed.mNews, events);
      return {
        ok: true,
        provider,
        trackingCode,
        latestStatus,
        pickupStoreName: parsed.info["store_name"],
        pickupDeadline: parsed.info["deadline"],
        paymentInfo: parsed.info["servicetype"],
        events,
        rawSummary: {
          query_no: queryNo,
          m_news: parsed.mNews,
          info: parsed.info,
          attempts,
        },
      };
    } catch (err) {
      lastError = "NETWORK_FAILED";
      lastMessage = errMessage(err);
    }
  }

  return {
    ok: false,
    provider,
    trackingCode,
    errorCode: lastError,
    message: `All ${attempts} attempt(s) failed. Last: ${lastMessage}`,
    attempts,
  };
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function isValidOrderId(id: string): boolean {
  return id.length === 8 || id.length === 11 || id.length === 12;
}

function collectCookies(res: Response): string {
  // Node fetch exposes combined set-cookie via getSetCookie() (undici)
  const headers = res.headers as Headers & { getSetCookie?: () => string[] };
  const raw =
    typeof headers.getSetCookie === "function"
      ? headers.getSetCookie()
      : res.headers.get("set-cookie")
        ? [res.headers.get("set-cookie") as string]
        : [];
  return raw.map((c) => c.split(";")[0]).join("; ");
}

function extractInputValue(html: string, id: string): string | null {
  // <input ... id="__VIEWSTATE" ... value="..." /> (attribute order may vary)
  const tagRe = new RegExp(`<input[^>]*\\bid="${id}"[^>]*>`, "i");
  const tag = html.match(tagRe)?.[0];
  if (!tag) return null;
  const value = tag.match(/\bvalue="([^"]*)"/i)?.[1];
  return value ?? null;
}

function extractCaptchaUrl(html: string): string | null {
  const m = html.match(/src="(ValidateImage\.aspx\?ts=[0-9]+)"/i);
  return m ? BASE_URL + m[1] : null;
}

/** 從整份 HTML 依 id 抓某元素內文（span / h4 / p 等）。HTML id 唯一，避開巢狀 div 截斷問題。 */
function extractById(html: string, id: string): string | null {
  const re = new RegExp(
    `<(?:span|h4|p|div)[^>]*\\bid="${id}"[^>]*>([\\s\\S]*?)<\\/(?:span|h4|p|div)>`,
    "i",
  );
  const m = html.match(re);
  return m ? stripTags(m[1]) : null;
}

/** 取 <ul id="timeline_status" ...>...</ul> 內的每個 <p>…</p>（含 <br/> 的狀態+時間）。 */
function extractShipping(html: string): string[] {
  const block = html.match(
    /<ul[^>]*\bid="timeline_status"[^>]*>([\s\S]*?)<\/ul>/i,
  )?.[1];
  if (!block) return [];
  const res: string[] = [];
  const re = /<p[^>]*>([\s\S]*?)<\/p>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(block))) {
    const t = stripTags(m[1]);
    if (t) res.push(t);
  }
  return res;
}

function parseResponse(html: string): ParsedResponse {
  const empty: ParsedResponse = {
    kind: "parser_failed",
    info: {},
    mNews: "",
    shipping: [],
  };

  // alert('...') => 多半是驗證碼錯誤或其他訊息
  const alertMatch = html.match(/alert\('([^']*)'\)/i);
  if (alertMatch) {
    const msg = alertMatch[1];
    if (msg.includes("驗證碼")) {
      return { ...empty, kind: "captcha_error", message: msg };
    }
    if (msg) {
      return { ...empty, kind: "no_result", message: msg };
    }
  }

  // lbMsg 錯誤訊息（現況驗證碼錯誤時此處可能為空字串）
  const lbMsg = html.match(
    /<span[^>]*\bid="lbMsg"[^>]*>([\s\S]*?)<\/span>/i,
  )?.[1];
  const lbText = lbMsg ? stripTags(lbMsg) : "";

  const queryNo = extractById(html, "query_no");
  const shipping = extractShipping(html);

  // 成功頁必須有 query_no 與貨態時間軸；否則視為驗證失敗 / 無資料
  if (!queryNo || shipping.length === 0) {
    if (lbText.includes("驗證")) {
      return { ...empty, kind: "captcha_error", message: lbText };
    }
    return {
      ...empty,
      kind: "no_result",
      message: lbText || "no query_no / timeline",
    };
  }

  const info: Record<string, string> = { query_no: queryNo };
  const storeName = extractById(html, "store_name");
  if (storeName) info["store_name"] = storeName;
  const deadline = extractById(html, "deadline");
  if (deadline) info["deadline"] = deadline;
  const serviceType = extractById(html, "servicetype");
  if (serviceType) info["servicetype"] = serviceType;

  // m_news：最新狀態（取貨態第一筆作為摘要來源）
  const mNews = html.match(
    /<div[^>]*\bclass="[^"]*\bm_news\b[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
  )?.[1];

  return {
    kind: "success",
    info,
    mNews: mNews ? stripTags(mNews) : (shipping[0] ?? ""),
    shipping,
  };
}

const TIME_RE = /(\d{4}\/\d{2}\/\d{2}\s+\d{2}:\d{2}(?::\d{2})?)/;

function buildEvents(shipping: string[]): SevenElevenEvent[] {
  return shipping.map((rawText) => {
    const m = rawText.match(TIME_RE);
    const occurredAt = m ? m[1] : null;
    const statusText = m ? rawText.replace(m[1], "").trim() : rawText.trim();
    return { occurredAt, statusText, rawText };
  });
}

function extractLatestStatus(
  mNews: string,
  events: SevenElevenEvent[],
): string {
  // m_news 形如「包裹配達取件門市2026/06/10 03:37:10」
  const m = mNews.match(/^([\s\S]*?)(\d{4}\/\d{2}\/\d{2})/);
  if (m && m[1].trim()) return m[1].trim();
  return events[0]?.statusText ?? "";
}

function stripTags(s: string): string {
  return s
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * 預設 OCR：以 resolveTesseractBinary() 找 tesseract binary 後 spawn。
 * 優先 TESSERACT_BIN env → 已知 nix store 路徑 → fallback "tesseract"。
 * 若 binary 不存在，reject 的 ENOENT 會被上層包成 OCR_FAILED。
 */
const defaultTesseractSolver: CaptchaSolver = async (imageBytes) => {
  const { spawn } = await import("node:child_process");
  const tesseractBin = resolveTesseractBinary();
  return await new Promise<string>((resolve, reject) => {
    const proc = spawn(
      tesseractBin,
      [
        "stdin",
        "stdout",
        "--psm",
        "8",
        "-c",
        "tessedit_char_whitelist=0123456789",
      ],
      { stdio: ["pipe", "pipe", "pipe"] },
    );
    let out = "";
    let err = "";
    proc.stdout.on("data", (d) => (out += d.toString()));
    proc.stderr.on("data", (d) => (err += d.toString()));
    proc.on("error", (e) => {
      const nodeErr = e as NodeJS.ErrnoException;
      if (nodeErr.code === "ENOENT") {
        reject(
          new Error(
            `Tesseract binary not found at "${tesseractBin}". ` +
              `In published deployment, set TESSERACT_BIN env var or add tesseract to replit.nix. (${e.message})`,
          ),
        );
      } else {
        reject(e);
      }
    });
    proc.on("close", (codeNum) => {
      if (codeNum === 0) resolve(out.trim());
      else reject(new Error(`tesseract exited ${codeNum}: ${err}`));
    });
    proc.stdin.write(Buffer.from(imageBytes));
    proc.stdin.end();
  });
};

// ---------------------------------------------------------------------------
// Common-result bridge（Step 7N-C）— 型別轉換 only，不打外部、不寫 DB、不改既有行為
// ---------------------------------------------------------------------------

/** 7-11 狀態文字 → 標準化貨態（Step 7O-STABILITY-RETRY で実 E2E 8 patterns 追加） */
export function normalizeSevenElevenStatus(
  statusText: string,
): NormalizedTrackingStatus {
  const s = (statusText ?? "").trim();
  if (!s) return "unknown";
  // 取件完成（「成功取件」「已完成包裹成功取件」等）
  if (/(已取件|完成取件|取貨完成|成功取件)/.test(s)) return "picked_up";
  // 抵達取件門市（「配達取件門市」等）
  if (/(到達門市|門市取貨|已到店|到店|配達)/.test(s)) return "arrived_store";
  if (/(退回|退貨|退件)/.test(s)) return "returned";
  if (/(異常|遺失|閉店)/.test(s)) return "exception";
  // 配送中 / 物流中心通過（「物流中心」は離開・到達・驗收 含む）
  if (/(配送|運送|轉運|出貨|物流中心|送達)/.test(s)) return "in_transit";
  // 訂單建立 / 待出貨（「已成立」「尚未寄件」を追加）
  if (/(交寄|建立|收件|已成立|尚未寄件)/.test(s)) return "pending";
  return "unknown";
}

/** 7-11 errorCode 皆已存在於共用 enum；retryable 對齊 7N-A 計畫（OCR/captcha → 人工 fallback 不自動重試） */
const SEVEN_ELEVEN_RETRYABLE: Record<SevenElevenErrorCode, boolean> = {
  OCR_FAILED: false,
  VERIFY_FAILED: false,
  NO_RESULT: false,
  PARSER_FAILED: false,
  NETWORK_FAILED: true,
  REMOTE_CHANGED: false,
  UNKNOWN_ERROR: true,
};

/**
 * SevenElevenTrackingResult → 共用 TrackingAdapterResult<"711">。
 * 純資料轉換：不查外部、不查 DB。供未來 controlled worker 接 7-11 時使用。
 */
export function bridgeSevenElevenResult(
  result: SevenElevenTrackingResult,
): TrackingAdapterResult<"711"> {
  if (!result.ok) {
    return {
      ok: false,
      provider: "711",
      trackingCode: result.trackingCode,
      errorCode: result.errorCode as TrackingAdapterErrorCode,
      message: result.message,
      retryable: SEVEN_ELEVEN_RETRYABLE[result.errorCode] ?? false,
    };
  }
  const events = result.events.map((e) => ({
    eventStatus: e.statusText || "unknown",
    eventDescription: e.statusText || e.rawText || "unknown",
    eventLocation: null,
    occurredAt: e.occurredAt,
    rawData: { rawText: e.rawText },
  }));
  const latest = events[0] ?? null;
  return {
    ok: true,
    provider: "711",
    trackingCode: result.trackingCode,
    normalizedStatus: normalizeSevenElevenStatus(result.latestStatus),
    latestStatusText: result.latestStatus,
    latestEventAt: latest?.occurredAt ?? null,
    events,
    rawSummary: {
      pickupStoreName: result.pickupStoreName ?? null,
      pickupDeadline: result.pickupDeadline ?? null,
      eventCount: events.length,
    },
  };
}
