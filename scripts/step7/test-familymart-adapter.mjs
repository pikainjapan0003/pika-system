#!/usr/bin/env node
/**
 * Step 7D — FamilyMart adapter smoke test（live endpoint，手動跑）。
 *
 * Usage: node scripts/step7/test-familymart-adapter.mjs [trackingCode]
 *
 * 依賴外網（ecfme.fme.com.tw），所以不放進必跑 unit test。
 * 已知可查貨號預設 16341539811。
 */
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

// re-exec with tsx --import so the .ts adapter can be loaded (same pattern as other step7 runners)
if (!process.env.__FAMI_TSX) {
  const { spawnSync } = await import("node:child_process");
  const r = spawnSync(
    process.execPath,
    ["--import", path.join(ROOT, "scripts/node_modules/tsx/dist/esm/index.mjs"), fileURLToPath(import.meta.url), ...process.argv.slice(2)],
    { stdio: "inherit", env: { ...process.env, __FAMI_TSX: "1" } }
  );
  process.exit(r.status ?? 1);
}

const { queryFamilyMartTracking } = await import(
  pathToFileURL(path.join(ROOT, "artifacts/api-server/src/lib/logistics/adapters/familyMartAdapter.ts"))
);

const KNOWN = process.argv[2] ?? "16341539811";
let failures = 0;

function check(name, cond, detail) {
  const ok = Boolean(cond);
  console.log(`${ok ? "✔" : "✖"} ${name}${ok ? "" : ` — ${detail ?? ""}`}`);
  if (!ok) failures++;
}

// 1. known tracking code
const res = await queryFamilyMartTracking({ trackingCode: KNOWN });
check("known code: ok = true", res.ok, JSON.stringify(res));
if (res.ok) {
  check("provider = familymart", res.provider === "familymart");
  check("trackingCode echoed", res.trackingCode === KNOWN);
  check("events.length > 0", res.events.length > 0);
  check("latestStatusText non-empty", res.latestStatusText.length > 0);
  check("normalizedStatus present", typeof res.normalizedStatus === "string" && res.normalizedStatus.length > 0);
  check("events ordered oldest→latest", !res.events[0].occurredAt || !res.events.at(-1).occurredAt || res.events[0].occurredAt <= res.events.at(-1).occurredAt);
  console.log(`  → normalizedStatus=${res.normalizedStatus} latest="${res.latestStatusText}" at=${res.latestEventAt} events=${res.events.length}`);
  const dump = JSON.stringify(res);
  check("no customer PII keys in output", !/RCV_USER_NAME|buyerName|buyerPhone/i.test(dump));
}

// 2. invalid tracking code (empty / non-numeric)
for (const bad of ["", "abc-123"]) {
  const r = await queryFamilyMartTracking({ trackingCode: bad });
  check(`invalid code "${bad}": ok=false INVALID_TRACKING_CODE`, !r.ok && r.errorCode === "INVALID_TRACKING_CODE", JSON.stringify(r));
}

// 3. fake numeric code → NO_RESULT (must not throw)
const fake = await queryFamilyMartTracking({ trackingCode: "99999999999" });
check("fake code: ok=false", !fake.ok, JSON.stringify(fake));
check("fake code: NO_RESULT or REMOTE_ERROR", !fake.ok && ["NO_RESULT", "REMOTE_ERROR"].includes(fake.errorCode), JSON.stringify(fake));

// 4. timeout path (1ms timeout must yield TIMEOUT, not throw)
const t = await queryFamilyMartTracking({ trackingCode: KNOWN, timeoutMs: 1 });
check("timeoutMs=1: ok=false TIMEOUT, retryable", !t.ok && t.errorCode === "TIMEOUT" && t.retryable === true, JSON.stringify(t));

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
