import { useState, useCallback } from "react";
import { useLocation } from "wouter";

const IS_PROD = import.meta.env.PROD;

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

function buildCodexPayload(data: HandoffData): string {
  const lines: string[] = ["## Claude Handoff for Codex", ""];

  if (data.generatedAt) {
    lines.push(`_Generated: ${data.generatedAt}_`, "");
  }

  lines.push("### Full Claude Reply", "");
  lines.push(data.rawReply || "(no reply)", "");
  lines.push("---", "");
  lines.push("### Summary", data.summary?.trim() || "(no summary)", "");

  if (data.filesChanged?.length) {
    lines.push("### Files changed");
    data.filesChanged.forEach((f) => lines.push(`- ${f}`));
    lines.push("");
  }

  lines.push(
    "### Git status",
    "```",
    data.gitStatus?.trim() || "(none)",
    "```",
    ""
  );

  if (data.gitLog?.trim()) {
    lines.push("### Recent commits", "```", data.gitLog.trim(), "```", "");
  }

  if (data.stagedChanges?.trim()) {
    lines.push("### Staged changes", "```", data.stagedChanges.trim(), "```", "");
  }

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

function DevHandoffInner() {
  const [, setLocation] = useLocation();
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
    <div className="min-h-[100dvh] bg-background max-w-[640px] mx-auto pb-10">
      <header className="bg-white border-b border-border px-5 pt-10 pb-4 sticky top-0 z-10">
        <div className="flex items-center justify-between">
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
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="h-8 px-3 text-xs font-medium bg-secondary text-foreground rounded-xl disabled:opacity-50"
          >
            {loading ? "載入中..." : "重新載入"}
          </button>
        </div>
        {data?.generatedAt && (
          <p className="text-xs text-muted-foreground mt-1">
            最後更新：{new Date(data.generatedAt).toLocaleString("zh-TW")}
            　Status：
            <span
              className={`font-medium ${
                data.finalStatus === "completed"
                  ? "text-green-600"
                  : data.finalStatus === "empty"
                  ? "text-muted-foreground"
                  : "text-yellow-600"
              }`}
            >
              {data.finalStatus ?? "—"}
            </span>
          </p>
        )}
      </header>

      <div className="px-5 py-5 space-y-4">
        {/* Load prompt on first visit */}
        {!data && !loading && !fetchError && (
          <div className="bg-white rounded-2xl border border-border p-6 text-center space-y-3">
            <p className="text-2xl">📋</p>
            <p className="font-semibold text-foreground">Dev Handoff Relay</p>
            <p className="text-sm text-muted-foreground">
              Claude Code 寫入 <code className="bg-secondary px-1 rounded">dev-handoff/latest.json</code>
              ，這裡一鍵複製給 Codex
            </p>
            <button
              type="button"
              onClick={load}
              className="h-10 px-6 bg-primary text-white text-sm font-semibold rounded-xl"
            >
              載入最新 Handoff
            </button>
          </div>
        )}

        {fetchError && (
          <div className="bg-destructive/10 text-destructive text-sm px-4 py-3 rounded-xl">
            {fetchError}
          </div>
        )}

        {data && isEmpty && (
          <div className="bg-white rounded-2xl border border-border p-6 text-center space-y-2">
            <p className="text-2xl">📭</p>
            <p className="font-semibold text-foreground">尚無 Handoff 內容</p>
            <p className="text-sm text-muted-foreground">
              請 Claude Code 寫入{" "}
              <code className="bg-secondary px-1 rounded">dev-handoff/latest.json</code>
            </p>
          </div>
        )}

        {data && !isEmpty && (
          <>
            {/* Action buttons */}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => copy("codex", codexPayload)}
                className="h-12 bg-primary text-white text-sm font-semibold rounded-xl col-span-2"
              >
                {copiedKey === "codex" ? "✓ 已複製給 Codex（完整版）" : "複製給 Codex（完整版）"}
              </button>
              <button
                type="button"
                onClick={() => copy("summary", summaryPayload)}
                disabled={!summaryPayload}
                className="h-10 bg-secondary text-foreground text-sm font-medium rounded-xl disabled:opacity-40"
              >
                {copiedKey === "summary" ? "✓ 已複製" : "複製摘要版"}
              </button>
              <button
                type="button"
                onClick={() => copy("git", data.gitStatus ?? "")}
                disabled={!data.gitStatus}
                className="h-10 bg-secondary text-foreground text-sm font-medium rounded-xl disabled:opacity-40"
              >
                {copiedKey === "git" ? "✓ 已複製" : "複製 git status"}
              </button>
            </div>

            {/* rawReply exact-copy indicator */}
            <div className={`rounded-xl px-3 py-2 space-y-1 text-xs ${isExactMode && hasVerification ? "bg-green-50 border border-green-200" : isExactMode ? "bg-blue-50 border border-blue-200" : "bg-yellow-50 border border-yellow-200"}`}>
              <div className="flex items-center gap-2">
                <span>{isExactMode && hasVerification ? "✓" : isExactMode ? "~" : "⚠"}</span>
                <span className={`font-medium ${isExactMode && hasVerification ? "text-green-800" : isExactMode ? "text-blue-800" : "text-yellow-800"}`}>
                  rawReply mode: {data.rawReplyMode ?? "(未設定)"}
                </span>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-muted-foreground pl-5">
                <span>length: <strong className="text-foreground">{data.rawReplyLength ?? rawReplyLen} chars</strong></span>
                {sha256Short ? (
                  <span className="font-mono">sha256: <strong className="text-foreground">{sha256Short}</strong></span>
                ) : (
                  <span className="text-yellow-700">sha256: ⚠ 未計算 — 執行 node scripts/write-dev-handoff.mjs</span>
                )}
              </div>
              {data.rawReplySha256 && (
                <div className="pl-5 font-mono text-muted-foreground break-all">
                  <span className="text-xs">{data.rawReplySha256}</span>
                </div>
              )}
            </div>
            <p className="text-xs text-muted-foreground px-1">
              rawReply 應與 Claude 最終回覆原文一字不漏一致。
            </p>

            {/* Sections */}
            <Section
              title={`完整 Claude 回覆 (rawReply)${rawReplyLen > 0 ? ` — ${rawReplyLen} 字` : " ⚠ 空"}`}
              content={data.rawReply}
            />
            <Section title="修改摘要" content={data.summary} />
            <Section title="修改的檔案" content={data.filesChanged} />
            <Section title="git log (最近 5)" content={data.gitLog} mono />
            <Section title="git status" content={data.gitStatus} mono />
            <Section
              title={`Staged changes${data.stagedChanges?.trim() ? "" : " (無)"}`}
              content={data.stagedChanges}
              mono
            />
            <Section
              title={`已接受修改 (Accepted fixes)`}
              content={data.acceptedFixes}
            />
            <Section
              title="封鎖 / 延後項目 (Blocked / deferred)"
              content={data.blockedDeferred}
            />
            <Section title="下一步建議 (Next task)" content={data.nextTask} />

            {/* Safety info */}
            <div className="bg-yellow-50 border border-yellow-200 rounded-2xl px-4 py-3 space-y-1">
              <p className="text-xs font-semibold text-yellow-800">安全確認</p>
              <p className="text-xs text-yellow-700">
                .claude/ 狀態：
                <span className={data.claudeUntracked ? "text-orange-600 font-bold" : "text-green-700"}>
                  {data.claudeUntracked ? "⚠ untracked（不要 stage）" : "✓ ok"}
                </span>
              </p>
              <p className="text-xs text-yellow-700">
                敏感詞已遮罩（SECRET / TOKEN / API_KEY / Bearer 等）
              </p>
            </div>

            {/* Clear button */}
            <button
              type="button"
              onClick={clearHandoff}
              disabled={clearing}
              className="w-full h-10 text-sm text-destructive border border-destructive/30 bg-white rounded-xl disabled:opacity-50"
            >
              {clearing ? "清空中..." : "清空 Handoff"}
            </button>
          </>
        )}

        {/* Write instructions (collapsible) */}
        <WriteInstructions />
      </div>
    </div>
  );
}

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
        <div className="border-t border-border px-4 py-3">
          <p className="text-xs font-semibold text-primary mb-1">
            Claude Code 每次回覆後都應自動更新 dev-handoff/latest.json（見 CLAUDE.md）
          </p>
          <p className="text-xs font-semibold text-destructive mb-1">
            rawReply 必須是終端機最終回覆原文的 exact copy，一字不漏，不可重寫、摘要或修改。
          </p>
          <p className="text-xs text-muted-foreground mb-2">
            格式如下，寫入後才輸出最終回覆：
          </p>
          <pre className="text-xs font-mono bg-secondary rounded-lg px-3 py-3 whitespace-pre-wrap break-words text-foreground">
{`dev-handoff/latest.json

{
  "generatedAt": "<ISO8601>",
  "rawReply": "<終端機最終回覆原文 exact copy>",
  "rawReplyMode": "exact_final_reply",
  "rawReplySha256": "<auto by scripts/write-dev-handoff.mjs>",
  "rawReplyLength": "<auto by scripts/write-dev-handoff.mjs>",
  "summary": "<一段摘要>",
  "filesChanged": ["path/to/file"],
  "gitLog": "<git log --oneline -5>",
  "gitStatus": "<git status --short>",
  "stagedChanges": "",
  "claudeUntracked": false,
  "acceptedFixes": ["fix 1"],
  "blockedDeferred": ["defer 1"],
  "nextTask": "下一步建議",
  "finalStatus": "completed"
}

# 寫完 rawReply 後執行（workspace root）：
node scripts/write-dev-handoff.mjs`}
          </pre>
        </div>
      )}
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
