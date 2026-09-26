import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { z } from "zod/v4";
import { getR2Config } from "../r2.ts";
import { validateInvoiceImage, type ValidatedInvoiceImage } from "./imageValidation.ts";
import { invoiceExtractionSchema } from "./schema.ts";
import { INVOICE_OCR_MODELS, INVOICE_IMAGE_DETAILS, INVOICE_REASONING_EFFORTS } from "./config.ts";
import { INVOICE_PROMPT_VERSION } from "./prompt.ts";
import type { InvoiceExtractionResult } from "./openaiInvoiceExtractor.ts";

// Only trusted database identities reach these functions. Receipt objects never
// use the public product-image route or caller-supplied URLs/bucket names.
export function invoiceImageKey(storeId: number, sha256: string): string {
  if (!Number.isSafeInteger(storeId) || storeId <= 0 || !/^[a-f0-9]{64}$/.test(sha256)) {
    throw new Error("Invalid invoice object identity");
  }
  return `invoice-ocr/${storeId}/${sha256}`;
}

export async function savePrivateInvoiceImage(storeId: number, image: ValidatedInvoiceImage) {
  const { client, bucket } = getR2Config();
  await client.send(new PutObjectCommand({
    Bucket: bucket, Key: invoiceImageKey(storeId, image.sha256),
    Body: image.buffer, ContentType: image.mimeType, CacheControl: "private, no-store",
  }), { abortSignal: AbortSignal.timeout(15000) });
}

async function readObject(key: string, maximum: number) {
  const { client, bucket } = getR2Config();
  const object = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }),
    { abortSignal: AbortSignal.timeout(15000) });
  if (!object.Body || !object.ContentLength || object.ContentLength > maximum) {
    throw new Error("Invalid stored invoice object size");
  }
  const bytes = Buffer.from(await object.Body.transformToByteArray());
  if (bytes.length !== object.ContentLength || bytes.length > maximum) throw new Error("Incomplete invoice object");
  return { bytes, contentType: object.ContentType };
}

export async function loadPrivateInvoiceImage(storeId: number, sha256: string, maxFileBytes: number) {
  const object = await readObject(invoiceImageKey(storeId, sha256), maxFileBytes);
  const image = validateInvoiceImage({ buffer: object.bytes,
    declaredMimeType: object.contentType ?? "", originalName: "stored-invoice", maxFileBytes });
  if (image.sha256 !== sha256) throw new Error("Stored invoice hash mismatch");
  return image;
}

const nullableCount = z.number().int().nonnegative().nullable();
const resultSchema = z.object({
  prediction: invoiceExtractionSchema,
  requestedModel: z.enum(INVOICE_OCR_MODELS), actualModel: z.string().trim().min(1).max(200),
  promptVersion: z.literal(INVOICE_PROMPT_VERSION), imageDetail: z.enum(INVOICE_IMAGE_DETAILS),
  reasoningEffort: z.enum(INVOICE_REASONING_EFFORTS),
  responseId: z.string().min(1).max(200), requestId: z.string().max(200).nullable(),
  inputTokens: nullableCount, outputTokens: nullableCount, totalTokens: nullableCount,
  cachedInputTokens: nullableCount, reasoningTokens: nullableCount,
  latencyMs: z.number().int().nonnegative(), attemptCount: z.number().int().min(1).max(2),
});

function resultKey(storeId: number, sha256: string, runId: number) {
  if (!Number.isSafeInteger(runId) || runId <= 0) throw new Error("Invalid run identity");
  return `${invoiceImageKey(storeId, sha256)}/runs/${runId}.json`;
}

// A small durable copy of the validated response allows a failed database write
// to be recovered without paying for another extraction. No raw request, image
// URL, credentials, or ground truth is included.
export async function savePrivateInvoiceResult(storeId: number, sha256: string, runId: number, result: InvoiceExtractionResult) {
  const body = JSON.stringify(resultSchema.parse(result));
  if (Buffer.byteLength(body) > 64000) throw new Error("Invoice result too large");
  const { client, bucket } = getR2Config();
  await client.send(new PutObjectCommand({ Bucket: bucket, Key: resultKey(storeId, sha256, runId),
    Body: body, ContentType: "application/json", CacheControl: "private, no-store" }),
  { abortSignal: AbortSignal.timeout(15000) });
}

export async function loadPrivateInvoiceResult(storeId: number, sha256: string, runId: number) {
  try {
    const { bytes } = await readObject(resultKey(storeId, sha256, runId), 64000);
    return resultSchema.parse(JSON.parse(bytes.toString("utf8")));
  } catch (error) {
    if ((error as { name?: string }).name === "NoSuchKey") return null;
    throw error;
  }
}
