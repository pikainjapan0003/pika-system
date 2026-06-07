import { useState, useCallback } from "react";
import { useLocation } from "wouter";

const IS_PROD = import.meta.env.PROD;

// ─── Interfaces ───────────────────────────────────────────────────────────────

interface HandoffData {
  generatedAt: string | null;
  rawReply?: string;
  rawReplyMode?: string;
  rawReplySha256?: string;
  rawReplyLength?: number;
  summary?: string;
  filesChanged?: string[];
  gitLog?: string;
  gitStatus?: string;
  stagedChanges?: string;
  claudeUntracked?: boolean;
  acceptedFixes?: string[];
  blockedDeferred?: string[];
  nextTask?: string;
  finalStatus?: string;
}

interface HandoffDataV2 {
  handoffVersion?: string;
  mode?: string;
  worker?: string;
  taskTitle?: string;
  branch?: string;
  status?: string;
  summary?: string[];
  modifiedFiles?: string[];
  testsRun?: string[];
  testsNotRun?: Array<{ name: string; reason: string }>;
  risks?: string[];
  pendingQuestions?: string[];
  rawReply?: string;
  updatedAt?: string;
  notFound?: boolean;
}

// ─── Legacy format helpers ────────────────────────────────────────────────────

function buildCodexPayload(data: HandoffData): string {
  const lines: string[] = ["## Claude Handoff for Codex", ""];
  if (data.generatedAt) lines.push(`_Generated: ${data.generatedAt}_`, "");
  lines.push("### Full Claude Reply", "");
  lines.push(data.rawReply || "(no reply)", "");
  lines.push("---", "");
  lines.push("### Summary", data.summary?.trim() || "(no summary)", "");
  if (data.filesChanged?.length) {
    lines.push("### Files changed");
    data.filesChanged.forEach((f) => lines.push(`- ${f}`));
    lines.push("");
  }
  lines.push("### Git status", "```", data.gitStatus?.trim() || "(none)", "```", "");
  if (data.gitLog?.trim()) lines.push("### Recent commits", "```", data.gitLog.trim(), "```", "");
  if (data.stagedChanges?.trim()) lines.push("### Staged changes", "```", data.stagedChanges.trim(), "```", "");
  if (data.acceptedFixes?.length) {
    lines.push("### Accepted fixes");
    data.acceptedFixes.forEach((f) => lines.push(`- ${f}`));
    lines.push("");
  }
  if (data.blockedDeferred?.length) {
    lines.push("### Blocked / deferred");
    data.blockedDeferred.forEach((f) => lines.push(`- ${f}`));
    lines.push("");
  }
  lines.push("### Next task", data.nextTask?.trim() || "(not specified)", "");
  lines.push(
    "### Safety notes",
    `- Status: ${data.finalStatus ?? "unknown"}`,
    `- .claude/ untracked: ${data.claudeUntracked ? "YES (check before staging)" : "ok"}`,
    ""
  );
  return lines.join("\n");
}

function buildSummaryPayload(data: HandoffData): string {
  const lines: string[] = ["## Claude Handoff for Codex (Summary)", ""];
  if (data.generatedAt) lines.push(`_Generated: ${data.generatedAt}_`, "");
  lines.push("### Summary", data.summary?.trim() || "(no summary)", "");
  if (data.filesChanged?.length) {
    lines.push("### Files changed");
    data.filesChanged.forEach((f) => lines.push(`- ${f}`));
    lines.push("");
  }
  lines.push("### Git status", "```", data.gitStatus?.trim() || "(none)", "```", "");
  if (data.blockedDeferred?.length) {
    lines.push("### Blocked / deferred");
    data.blockedDeferred.forEach((f) => lines.push(`- ${f}`));
    lines.push("");
  }
  lines.push("### Next task", data.nextTask?.trim() || "(not specified)", "");
  return lines.join("\n");
}

// ─── V2 format helper ─────────────────────────────────────────────────────────

function buildV2CopyPayload(label: string, data: HandoffDataV2): string {
  const lines: string[] = [`## ${label} Handoff for Codex`, ""];
  if (data.taskTitle) lines.push(`**Task:** ${data.taskTitle}`, "");
  if (data.branch) lines.push(`**Branch:** ${data.branch}`, "");
  if (data.updatedAt) lines.push(`_Updated: ${data.updatedAt}_`, "");
  if (data.status) lines.push(`**Status:** ${data.status}`, "");
  lines.push("---", "");
  if (data.rawReply) {
    lines.push("### Full Reply", "", data.rawReply, "");
    lines.push("---", "");
  }
  if (data.summary?.length) {
    lines.push("### Summary");
    data.summary.forEach((s) => lines.push(`- ${s}`));
    lines.push("");
  }
  if (data.modifiedFiles?.length) {
    lines.push("### Modified Files");
    data.modifiedFiles.forEach((f) => lines.push(`- ${f}`));
    lines.push("");
  }
  if (data.testsRun?.length) {
    lines.push("### Tests Run");
    data.testsRun.forEach((t) => lines.push(`- ${t}`));
    lines.push("");
  }
  if (data.risks?.length) {
    lines.push("### Risks");
    data.risks.forEach((r) => lines.push(`- ${r}`));
    lines.push("");
  }
  if (data.pendingQuestions?.length) {
    lines.push("### Pending Questions");
    data.pendingQuestions.forEach((q) => lines.push(`- ${q}`));
    lines.push("");
  }
  return lines.join("\n");
}

// ─── Shared hook and component ────────────────────────────────────────────────

function useCopy() {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const copy = useCallback((key: string, text: string) => {
    if (!text.trim()) return;
    navigator.clipboard.writeText(text).then(() => {
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2000);
    }).catch(() => {});
  }, []);
  return { copiedKey, copy };
}

function Section({
  title,
  content,
  mono = false,
}: {
  title: string;
  content: string | string[] | undefined | null;
  mono?: boolean;
}) {
  const [open, setOpen] = useState(true);
  const isEmpty =
    !content || (Array.isArray(content) ? content.length === 0 : !content.trim());
  return (
    <div className="bg-white rounded-2xl border border-border overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-left"
      >
        <span className="text-sm font-semibold text-foreground">{title}</span>
        <span className="text-muted-foreground text-xs">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="border-t border-border px-4 py-3">
          {isEmpty ? (
            <p className="text-xs text-muted-foreground italic">（空）</p>
          ) : Array.isArray(content) ? (
            <ul className="space-y-1">
              {content.map((item, i) => (
                <li key={i} className="text-sm text-foreground">
                  • {item}
                </li>
              ))}
            </ul>
          ) : (
            <pre
              className={`text-sm text-foreground whitespace-pre-wrap break-words ${
                mono ? "font-mono bg-secondary rounded-lg px-3 py-2 text-xs" : ""
              }`}
            >
              {content}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Worker card (Claude A / Claude B) ────────────────────────────────────────

function WorkerCard({
  label,
  worker,
  filePath,
  accent,
}: {
  label: string;
  worker: "a" | "b";
  filePath: string;
  accent: "blue" | "purple";
}) {
  const [data, setData] = useState<HandoffDataV2 | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { copiedKey, copy } = useCopy();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/dev/handoff/data/${worker}?t=${Date.now()}`);
      if (!res.ok) {
        setError(`API returned ${res.status}`);
        return;
      }
      const json = (await res.json()) as HandoffDataV2;
      setData(json);
    } catch {
      setError("無法連線到 API server，請確認 pnpm dev 已啟動");
    } finally {
      setLoading(false);
    }
  }, [worker]);

  const notFound = data?.notFound === true;
  const hasData = data !== null && !notFound;
  const copyPayload = hasData ? buildV2CopyPayload(label, data) : "";
  const rawReplyLen = data?.rawReply?.length ?? 0;

  const a = accent === "blue"
    ? { badge: "bg-blue-100 text-blue-800", btn: "bg-blue-600 text-white" }
    : { badge: "bg-purple-100 text-purple-800", btn: "bg-purple-600 text-white" };

  return (
    <div className="bg-white rounded-2xl border border-border overflow-hidden">
      {/* Card header */}
      <div className="px-5 py-4 border-b border-border">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${a.badge}`}>
                {label}
              </span>
              {hasData && data.status && (
                <span
                  className={`text-xs font-medium ${
                    data.status === "completed" ? "text-green-600" : "text-yellow-600"
                  }`}
                >
                  {data.status}
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              <code className="bg-secondary px-1 rounded">{filePath}</code>
            </p>
            {hasData && data.updatedAt && (
              <p className="text-xs text-muted-foreground mt-0.5">
                {new Date(data.updatedAt).toLocaleString("zh-TW")}
              </p>
            )}
            {hasData && data.taskTitle && (
              <p className="text-xs text-foreground font-medium mt-1 truncate">
                {data.taskTitle}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="h-8 px-3 text-xs font-medium bg-secondary text-foreground rounded-xl disabled:opacity-50 flex-shrink-0"
          >
            {loading ? "載入中..." : hasData ? "重新載入" : `載入 ${label} Handoff`}
          </button>
        </div>
      </div>

      {/* Card body */}
      <div className="px-5 py-4 space-y-3">
        {error && (
          <div className="bg-destructive/10 text-destructive text-sm px-4 py-3 rounded-xl">
            {error}
          </div>
        )}

        {!data && !loading && !error && (
          <div className="text-center py-4">
            <p className="text-sm text-muted-foreground mb-3">按下按鈕載入 handoff</p>
            <button
              type="button"
              onClick={load}
              className={`h-10 px-6 text-sm font-semibold rounded-xl ${a.btn}`}
            >
              載入 {label} Handoff
            </button>
          </div>
        )}

        {data && notFound && (
          <div className="bg-secondary rounded-xl px-4 py-5 text-center space-y-2">
            <p className="text-2xl">📭</p>
            <p className="text-sm font-semibold text-foreground">
              尚未找到 {filePath}
            </p>
            <p className="text-xs text-muted-foreground">
              請先讓 {label} 完成任務並寫入 latest-{worker.toUpperCase()}
            </p>
          </div>
        )}

        {hasData && (
          <>
            <button
              type="button"
              onClick={() => copy(`copy-${worker}`, copyPayload)}
              disabled={!copyPayload.trim()}
              className={`w-full h-11 text-sm font-semibold rounded-xl ${a.btn} disabled:opacity-40`}
            >
              {copiedKey === `copy-${worker}`
                ? `✓ 已複製 ${label} 給 Codex`
                : `複製 ${label} 給 Codex`}
            </button>

            {data.rawReply !== undefined && (
              <div
                className={`rounded-xl px-3 py-2 text-xs ${
                  rawReplyLen > 0
                    ? "bg-green-50 border border-green-200 text-green-800"
                    : "bg-yellow-50 border border-yellow-200 text-yellow-800"
                }`}
              >
                rawReply：{rawReplyLen > 0 ? `${rawReplyLen} chars` : "⚠ 空"}
              </div>
            )}

            {data.rawReply ? (
              <Section
                title={`完整回覆 (rawReply) — ${rawReplyLen} 字`}
                content={data.rawReply}
              />
            ) : null}
            {data.summary && data.summary.length > 0 ? (
              <Section title="變更摘要" content={data.summary} />
            ) : null}
            {data.modifiedFiles && data.modifiedFiles.length > 0 ? (
              <Section title="修改檔案" content={data.modifiedFiles} />
            ) : null}
            {data.testsRun && data.testsRun.length > 0 ? (
              <Section title="已執行測試" content={data.testsRun} />
            ) : null}
            {data.risks && data.risks.length > 0 ? (
              <Section title="風險" content={data.risks} />
            ) : null}
            {data.pendingQuestions && data.pendingQuestions.length > 0 ? (
              <Section title="待確認問題" content={data.pendingQuestions} />
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

// ─── Legacy section (latest.json，舊版 / optional) ────────────────────────────

function LegacySection() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<HandoffData | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);
  const { copiedKey, copy } = useCopy();

  const load = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const res = await fetch("/api/dev/handoff/data");
      if (!res.ok) {
        setFetchError(`API returned ${res.status}`);
        return;
      }
      const json = (await res.json()) as HandoffData;
      setData(json);
    } catch {
      setFetchError("無法連線到 API server，請確認 pnpm dev 已啟動");
    } finally {
      setLoading(false);
    }
  }, []);

  const clearHandoff = useCallback(async () => {
    if (!confirm("確定要清空 handoff 內容嗎？")) return;
    setClearing(true);
    try {
      const res = await fetch("/api/dev/handoff/data", { method: "DELETE" });
      if (res.ok) await load();
    } finally {
      setClearing(false);
    }
  }, [load]);

  const isEmpty = !data || data.finalStatus === "empty";
  const codexPayload = data && !isEmpty ? buildCodexPayload(data) : "";
  const summaryPayload = data && !isEmpty ? buildSummaryPayload(data) : "";
  const rawReplyLen = data?.rawReply?.length ?? 0;
  const isExactMode = data?.rawReplyMode === "exact_final_reply";
  const hasVerification = !!data?.rawReplySha256;
  const sha256Short = data?.rawReplySha256
    ? `${data.rawReplySha256.slice(0, 8)}…${data.rawReplySha256.slice(-8)}`
    : null;

  return (
    <div className="bg-white rounded-2xl border border-border overflow-hidden opacity-70">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-left"
      >
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-muted-foreground">
            Legacy latest.json
          </span>
          <span className="text-xs text-muted-foreground bg-secondary px-1.5 py-0.5 rounded-full">
            舊版 / optional
          </span>
        </div>
        <span className="text-muted-foreground text-xs">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="border-t border-border px-4 py-4 space-y-3">
          <p className="text-xs text-muted-foreground">
            <code className="bg-secondary px-1 rounded">dev-handoff/latest.json</code>{" "}
            為舊版 / optional，不是 Fixed Latest File Mode 的預設輸出。
          </p>

          {!data && !loading && !fetchError && (
            <button
              type="button"
              onClick={load}
              className="h-9 px-4 bg-secondary text-foreground text-xs font-medium rounded-xl"
            >
              載入 legacy handoff
            </button>
          )}

          {loading && <p className="text-xs text-muted-foreground">載入中...</p>}

          {fetchError && (
            <div className="bg-destructive/10 text-destructive text-sm px-4 py-3 rounded-xl">
              {fetchError}
            </div>
          )}

          {data && isEmpty && (
            <p className="text-sm text-muted-foreground text-center py-2">
              尚無 legacy handoff 內容
            </p>
          )}

          {data && !isEmpty && (
            <>
              {data.generatedAt && (
                <p className="text-xs text-muted-foreground">
                  最後更新：{new Date(data.generatedAt).toLocaleString("zh-TW")}
                  　Status：{data.finalStatus ?? "—"}
                </p>
              )}

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => copy("legacy-codex", codexPayload)}
                  className="h-10 bg-secondary text-foreground text-xs font-medium rounded-xl col-span-2"
                >
                  {copiedKey === "legacy-codex"
                    ? "✓ 已複製（完整版）"
                    : "複製 legacy 給 Codex（完整版）"}
                </button>
                <button
                  type="button"
                  onClick={() => copy("legacy-summary", summaryPayload)}
                  disabled={!summaryPayload}
                  className="h-9 bg-secondary text-foreground text-xs font-medium rounded-xl disabled:opacity-40"
                >
                  {copiedKey === "legacy-summary" ? "✓ 已複製" : "複製摘要版"}
                </button>
                <button
                  type="button"
                  onClick={clearHandoff}
                  disabled={clearing}
                  className="h-9 text-xs text-destructive border border-destructive/30 bg-white rounded-xl disabled:opacity-50"
                >
                  {clearing ? "清空中..." : "清空"}
                </button>
              </div>

              <div
                className={`rounded-xl px-3 py-2 space-y-1 text-xs ${
                  isExactMode && hasVerification
                    ? "bg-green-50 border border-green-200"
                    : isExactMode
                    ? "bg-blue-50 border border-blue-200"
                    : "bg-yellow-50 border border-yellow-200"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span>
                    {isExactMode && hasVerification ? "✓" : isExactMode ? "~" : "⚠"}
                  </span>
                  <span
                    className={`font-medium ${
                      isExactMode && hasVerification
                        ? "text-green-800"
                        : isExactMode
                        ? "text-blue-800"
                        : "text-yellow-800"
                    }`}
                  >
                    rawReply mode: {data.rawReplyMode ?? "(未設定)"}
                  </span>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-muted-foreground pl-5">
                  <span>
                    length:{" "}
                    <strong className="text-foreground">
                      {data.rawReplyLength ?? rawReplyLen} chars
                    </strong>
                  </span>
                  {sha256Short ? (
                    <span className="font-mono">
                      sha256:{" "}
                      <strong className="text-foreground">{sha256Short}</strong>
                    </span>
                  ) : (
                    <span className="text-yellow-700">sha256: ⚠ 未計算</span>
                  )}
                </div>
              </div>

              <Section
                title={`完整 Claude 回覆 (rawReply)${rawReplyLen > 0 ? ` — ${rawReplyLen} 字` : " ⚠ 空"}`}
                content={data.rawReply}
              />
              <Section title="修改摘要" content={data.summary} />
              <Section title="修改的檔案" content={data.filesChanged} />
              <Section title="git log (最近 5)" content={data.gitLog} mono />
              <Section title="git status" content={data.gitStatus} mono />
            </>
          )}

          {data && !loading && (
            <button
              type="button"
              onClick={load}
              className="h-7 px-3 text-xs bg-secondary text-muted-foreground rounded-xl"
            >
              重新載入
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Write instructions (Fixed Latest File Mode) ──────────────────────────────

function WriteInstructions() {
  const [open, setOpen] = useState(false);
  return (
    <div className="bg-white rounded-2xl border border-border overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-left"
      >
        <span className="text-xs font-semibold text-muted-foreground">
          如何讓 Claude Code 寫入 Handoff（展開說明）
        </span>
        <span className="text-muted-foreground text-xs">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="border-t border-border px-4 py-3 space-y-3">
          <p className="text-xs font-semibold text-primary">Fixed Latest File Mode</p>
          <ul className="text-xs text-muted-foreground space-y-1">
            <li>
              • Claude A 完成任務後寫入：
              <code className="bg-secondary px-1 rounded mx-0.5">dev-handoff/latest-A.json</code>、
              <code className="bg-secondary px-1 rounded mx-0.5">latest-A.md</code>
            </li>
            <li>
              • Claude B 完成任務後寫入：
              <code className="bg-secondary px-1 rounded mx-0.5">dev-handoff/latest-B.json</code>、
              <code className="bg-secondary px-1 rounded mx-0.5">latest-B.md</code>
            </li>
            <li>• 不需要更新 latest.json（已是 legacy / optional）</li>
            <li>• 不需要整合（A/B 各自獨立）</li>
          </ul>
          <p className="text-xs font-semibold text-destructive">
            rawReply 必須是終端機最終回覆原文的 exact copy，一字不漏，不可重寫、摘要或修改。
          </p>
          <pre className="text-xs font-mono bg-secondary rounded-lg px-3 py-3 whitespace-pre-wrap break-words text-foreground">
{`dev-handoff/latest-A.json

{
  "handoffVersion": "fixed-latest-v1",
  "mode": "fixed-latest-file",
  "worker": "claude-a",
  "taskTitle": "<task title>",
  "branch": "<current git branch>",
  "status": "completed",
  "summary": ["<change summary item>"],
  "modifiedFiles": ["<file path>"],
  "testsRun": ["<test>"],
  "testsNotRun": [],
  "risks": [],
  "pendingQuestions": [],
  "rawReply": "<終端機最終回覆原文 exact copy>",
  "updatedAt": "<ISO8601>"
}`}
          </pre>
        </div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

function DevHandoffInner() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-[100dvh] bg-background max-w-[640px] mx-auto pb-10">
      <header className="bg-white border-b border-border px-5 pt-10 pb-4 sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setLocation("/settings")}
            className="w-9 h-9 flex items-center justify-center rounded-xl bg-secondary text-foreground text-lg flex-shrink-0"
          >
            ←
          </button>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold bg-yellow-400 text-yellow-900 px-2 py-0.5 rounded-full">
              DEV
            </span>
            <h1 className="text-lg font-bold text-foreground">Dev Handoff Relay</h1>
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          Fixed Latest File Mode：Claude A / Claude B 各自寫入自己的 handoff 檔案，避免互相覆蓋。
        </p>
      </header>

      <div className="px-5 py-5 space-y-4">
        <WorkerCard
          label="Claude A"
          worker="a"
          filePath="dev-handoff/latest-A.json"
          accent="blue"
        />
        <WorkerCard
          label="Claude B"
          worker="b"
          filePath="dev-handoff/latest-B.json"
          accent="purple"
        />
        <LegacySection />
        <WriteInstructions />
      </div>
    </div>
  );
}

export default function DevHandoffPage() {
  if (IS_PROD) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center">
        <p className="text-sm text-muted-foreground">404 Not Found</p>
      </div>
    );
  }
  return <DevHandoffInner />;
}
