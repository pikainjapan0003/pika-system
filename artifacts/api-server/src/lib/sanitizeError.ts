export type SanitizedError = {
  name: string;
  message: string;
  code?: string;
};

const MAX_MESSAGE_LENGTH = 200;

function redactMessage(value: string): string {
  return value
    .replace(/(?:postgres(?:ql)?|postgres):\/\/[^\s"'`]+/gi, "[redacted]")
    .replace(/[A-Za-z]:[\\/][^\s"'`]+/g, "[redacted]")
    .replace(/\/home\/[^\s"'`]+/g, "[redacted]")
    .replace(/(?:^|[\\/])node_modules(?:[\\/][^\s"'`]+)?/gi, "[redacted]")
    .replace(/(?:failed\s+)?query\s*:[\s\S]*/gi, "query: [redacted]")
    .replace(/params?\s*:[\s\S]*/gi, "params: [redacted]")
    .replace(/\bat\s+(?:async\s+)?[^\r\n]+(?:\r?\n|$)/gi, "[redacted] ")
    .replace(/\s{2,}/g, " ")
    .trim()
    .slice(0, MAX_MESSAGE_LENGTH);
}

function safeName(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) return "Error";
  return redactMessage(value).slice(0, 80) || "Error";
}

function safeCode(value: unknown): string | undefined {
  if (typeof value !== "string" && typeof value !== "number") return undefined;
  const code = String(value);
  return /^[A-Za-z0-9._-]{1,50}$/.test(code) ? code : undefined;
}

export function sanitizeError(error: unknown): SanitizedError {
  const candidate = error as {
    name?: unknown;
    message?: unknown;
    code?: unknown;
  } | null;
  const rawMessage =
    typeof candidate?.message === "string"
      ? candidate.message
      : typeof error === "string"
        ? error
        : error == null
          ? "Unknown error"
          : String(error);
  const result: SanitizedError = {
    name: safeName(candidate?.name),
    message: redactMessage(rawMessage),
  };
  const code = safeCode(candidate?.code);
  if (code) result.code = code;
  return result;
}
