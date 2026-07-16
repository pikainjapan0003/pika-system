import { appendFileSync } from "node:fs";

import { createBankOfTaiwanRateAdapter } from "../src/lib/exchangeRateReference.ts";

const adapter = createBankOfTaiwanRateAdapter();

try {
  const quote = await adapter.fetchJpyTwdSpotSell();
  const summary = [
    "## Bank of Taiwan JPY/TWD reference probe",
    "",
    "Status: **available**",
    "",
    `- Source: ${quote.sourceName}`,
    `- Side: ${quote.side}`,
    `- Rate: ${quote.rate}`,
    `- Quoted at: ${quote.quotedAt}`,
    `- Fetched at: ${quote.fetchedAt}`,
    `- URL: ${quote.sourceUrl}`,
    "",
    "This is a read-only reference probe. No database or configured exchange-rate field was read or written.",
  ].join("\n");
  process.stdout.write(`${summary}\n`);
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${summary}\n`);
  }
} catch (error) {
  const message = error instanceof Error ? error.message : "unknown error";
  const summary = [
    "## Bank of Taiwan JPY/TWD reference probe",
    "",
    "Status: **unavailable (fail closed)**",
    "",
    `- Error: ${message}`,
    "- No fallback value was guessed or written.",
  ].join("\n");
  process.stderr.write(`${summary}\n`);
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${summary}\n`);
  }
  process.exitCode = 1;
}
