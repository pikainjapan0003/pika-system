import type { Request, Response } from "express";

export class PublicSafeError extends Error {
  readonly status: number;
  readonly expose = true;

  constructor(status: number, message: string) {
    if (!Number.isInteger(status) || status < 400 || status >= 500) {
      throw new RangeError("PublicSafeError status must be a 4xx status");
    }
    super(message);
    this.name = "PublicSafeError";
    this.status = status;
  }
}

const STATUS_MESSAGES: Record<number, string> = {
  400: "Bad request",
  401: "Unauthorized",
  403: "Forbidden",
  404: "Not found",
  405: "Method not allowed",
  409: "Conflict",
  422: "Unprocessable entity",
  429: "Too many requests",
};

function statusFrom(error: unknown): number {
  const candidate = error as { status?: unknown; statusCode?: unknown } | null;
  const status = candidate?.status ?? candidate?.statusCode;
  return typeof status === "number" &&
    Number.isInteger(status) &&
    status >= 400 &&
    status < 600
    ? status
    : 500;
}

function isExplicitlyPublicSafe(error: unknown): error is {
  message: string;
  expose: true;
} {
  if (error instanceof PublicSafeError) return true;
  const candidate = error as { message?: unknown; expose?: unknown } | null;
  return candidate?.expose === true && typeof candidate.message === "string";
}

export function publicErrorMessage(
  error: unknown,
  status = statusFrom(error),
): string {
  if (status >= 500) return "Internal server error";
  if (isExplicitlyPublicSafe(error)) return error.message;
  return STATUS_MESSAGES[status] ?? "Request failed";
}

export function sendPublicError(error: unknown, res: Response): void {
  const status = statusFrom(error);
  res.status(status).json({ error: publicErrorMessage(error, status) });
}

export function handlePublicError(
  error: unknown,
  _req: Request,
  res: Response,
  _next: (error?: unknown) => void,
): void {
  sendPublicError(error, res);
}
