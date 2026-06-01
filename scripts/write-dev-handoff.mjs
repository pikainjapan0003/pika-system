#!/usr/bin/env node
/**
 * Dev Handoff verification helper.
 *
 * Reads rawReply from dev-handoff/latest.json, computes SHA-256 and
 * character length, then writes rawReplySha256 + rawReplyLength back
 * to the same file.
 *
 * Usage (from workspace root):
 *   node scripts/write-dev-handoff.mjs
 */

import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const HANDOFF_PATH = resolve(__dirname, "../dev-handoff/latest.json");

let raw;
try {
  raw = await readFile(HANDOFF_PATH, "utf-8");
} catch (err) {
  if (err.code === "ENOENT") {
    console.error(`[write-dev-handoff] File not found: ${HANDOFF_PATH}`);
    console.error("  → Write dev-handoff/latest.json first, then run this script.");
    process.exit(1);
  }
  throw err;
}

const data = JSON.parse(raw);
const rawReply = typeof data.rawReply === "string" ? data.rawReply : "";

const sha256 = createHash("sha256").update(rawReply, "utf8").digest("hex");
const length = rawReply.length;

data.rawReplySha256 = sha256;
data.rawReplyLength = length;

await writeFile(HANDOFF_PATH, JSON.stringify(data, null, 2) + "\n", "utf-8");

console.log("[write-dev-handoff] Verification fields written:");
console.log(`  rawReplyLength : ${length} chars`);
console.log(`  rawReplySha256 : ${sha256}`);
