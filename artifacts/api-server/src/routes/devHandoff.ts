import { Router } from "express";
import { readFile, writeFile } from "fs/promises";
import path from "path";

const router = Router();

// Use process.argv[1] (the bundle entry path = dist/index.mjs) so the path is
// correct regardless of the working directory the server is started from.
const HANDOFF_PATH = path.resolve(
  path.dirname(process.argv[1]),
  "../../../dev-handoff/latest.json"
);

const SECRET_PATTERNS: RegExp[] = [
  /\b(SECRET|ACCESS[_-]?KEY|SECRET[_-]?KEY|API[_-]?KEY|ACCOUNT[_-]?ID|PASSWORD|PRIVATE[_-]?KEY)\s*[=:"'`]\s*\S{4,}/gi,
  /\bTOKEN\s*[=:"'`]\s*\S{4,}/gi,
  /Authorization:\s*Bearer\s+\S{4,}/gi,
  /Bearer\s+[A-Za-z0-9\-._~+/]{10,}=*/g,
];

function maskString(text: string): string {
  let out = text;
  for (const re of SECRET_PATTERNS) {
    out = out.replace(re, (match) => {
      const eqIdx = match.search(/[=:"'`\s]/);
      const prefix = eqIdx !== -1 ? match.slice(0, eqIdx + 1) : "";
      return `${prefix} [REDACTED]`;
    });
  }
  return out;
}

function maskValue(val: unknown): unknown {
  if (typeof val === "string") return maskString(val);
  if (Array.isArray(val)) return val.map(maskValue);
  if (val !== null && typeof val === "object") {
    return Object.fromEntries(
      Object.entries(val as Record<string, unknown>).map(([k, v]) => [k, maskValue(v)])
    );
  }
  return val;
}

router.get("/dev/handoff/data", async (_req, res) => {
  if (process.env.NODE_ENV === "production") {
    return res.status(404).json({ error: "Not found" });
  }

  try {
    const raw = await readFile(HANDOFF_PATH, "utf-8");
    const parsed = JSON.parse(raw) as unknown;
    return res.json(maskValue(parsed));
  } catch (err: unknown) {
    const fsErr = err as NodeJS.ErrnoException;
    if (fsErr?.code === "ENOENT") {
      return res.json({ finalStatus: "empty", generatedAt: null });
    }
    return res.status(500).json({ error: "Failed to read handoff file" });
  }
});

router.delete("/dev/handoff/data", async (_req, res) => {
  if (process.env.NODE_ENV === "production") {
    return res.status(404).json({ error: "Not found" });
  }

  const empty = {
    generatedAt: null,
    rawReply: "",
    summary: "",
    filesChanged: [],
    gitLog: "",
    gitStatus: "",
    stagedChanges: "",
    claudeUntracked: false,
    acceptedFixes: [],
    blockedDeferred: [],
    nextTask: "",
    finalStatus: "empty",
  };

  try {
    await writeFile(HANDOFF_PATH, JSON.stringify(empty, null, 2) + "\n", "utf-8");
    return res.json({ ok: true });
  } catch {
    return res.status(500).json({ error: "Failed to clear handoff file" });
  }
});

export default router;
