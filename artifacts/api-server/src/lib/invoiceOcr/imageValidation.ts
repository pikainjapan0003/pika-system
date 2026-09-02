import { createHash } from "node:crypto";

export const SUPPORTED_INVOICE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;
export type SupportedInvoiceMimeType =
  (typeof SUPPORTED_INVOICE_MIME_TYPES)[number];

export type InvoiceImageErrorCode =
  | "missing_image"
  | "image_too_large"
  | "unsupported_image_type"
  | "mime_type_mismatch"
  | "damaged_image"
  | "animated_image_not_supported";

export class InvoiceImageValidationError extends Error {
  constructor(
    readonly code: InvoiceImageErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "InvoiceImageValidationError";
  }
}

export interface ValidatedInvoiceImage {
  buffer: Buffer;
  mimeType: SupportedInvoiceMimeType;
  safeFilename: string;
  sha256: string;
  byteLength: number;
}

interface ImageStructure {
  mimeType: SupportedInvoiceMimeType;
  extension: "jpg" | "png" | "webp";
}

const MAX_IMAGE_PIXELS = 150_000_000;

function assertReasonableDimensions(width: number, height: number): void {
  if (
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width <= 0 ||
    height <= 0 ||
    width > 100_000 ||
    height > 100_000 ||
    width * height > MAX_IMAGE_PIXELS
  ) {
    throw new InvoiceImageValidationError(
      "damaged_image",
      "圖片尺寸無效或異常過大",
    );
  }
}

function isJpegStart(buffer: Buffer): boolean {
  return (
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  );
}

function validateJpeg(buffer: Buffer): ImageStructure {
  if (
    buffer.length < 32 ||
    buffer[buffer.length - 2] !== 0xff ||
    buffer[buffer.length - 1] !== 0xd9
  ) {
    throw new InvoiceImageValidationError(
      "damaged_image",
      "JPEG 圖片不完整或已損壞",
    );
  }

  let position = 2;
  let hasStartOfFrame = false;
  let hasStartOfScan = false;
  while (position < buffer.length - 2) {
    if (buffer[position] !== 0xff) {
      throw new InvoiceImageValidationError(
        "damaged_image",
        "JPEG 圖片結構無效",
      );
    }
    while (position < buffer.length && buffer[position] === 0xff) position++;
    if (position >= buffer.length) break;
    const marker = buffer[position++];
    if (marker === 0xd9) break;
    if (marker === 0x00 || marker === 0xd8) continue;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (position + 2 > buffer.length) {
      throw new InvoiceImageValidationError(
        "damaged_image",
        "JPEG 圖片區段不完整",
      );
    }
    const segmentLength = buffer.readUInt16BE(position);
    if (segmentLength < 2 || position + segmentLength > buffer.length) {
      throw new InvoiceImageValidationError(
        "damaged_image",
        "JPEG 圖片區段長度無效",
      );
    }

    const isStartOfFrame =
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf);
    if (isStartOfFrame) {
      if (segmentLength < 7) {
        throw new InvoiceImageValidationError(
          "damaged_image",
          "JPEG 圖片尺寸資料不完整",
        );
      }
      const height = buffer.readUInt16BE(position + 3);
      const width = buffer.readUInt16BE(position + 5);
      assertReasonableDimensions(width, height);
      hasStartOfFrame = true;
    }
    if (marker === 0xda) {
      hasStartOfScan = true;
      break;
    }
    position += segmentLength;
  }

  if (!hasStartOfFrame || !hasStartOfScan) {
    throw new InvoiceImageValidationError(
      "damaged_image",
      "JPEG 圖片缺少必要的影像資料",
    );
  }
  return { mimeType: "image/jpeg", extension: "jpg" };
}

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function isPngStart(buffer: Buffer): boolean {
  return (
    buffer.length >= 8 &&
    buffer.subarray(0, 8).equals(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    )
  );
}

function validatePng(buffer: Buffer): ImageStructure {
  let position = 8;
  let chunkIndex = 0;
  let hasImageData = false;
  let hasEnd = false;

  while (position + 12 <= buffer.length) {
    const length = buffer.readUInt32BE(position);
    const typeStart = position + 4;
    const dataStart = position + 8;
    const dataEnd = dataStart + length;
    const crcPosition = dataEnd;
    if (dataEnd + 4 > buffer.length) {
      throw new InvoiceImageValidationError(
        "damaged_image",
        "PNG 圖片區段不完整",
      );
    }
    const type = buffer.subarray(typeStart, dataStart).toString("ascii");
    const expectedCrc = buffer.readUInt32BE(crcPosition);
    const actualCrc = crc32(buffer.subarray(typeStart, dataEnd));
    if (expectedCrc !== actualCrc) {
      throw new InvoiceImageValidationError(
        "damaged_image",
        "PNG 圖片校驗失敗",
      );
    }
    if (chunkIndex === 0) {
      if (type !== "IHDR" || length !== 13) {
        throw new InvoiceImageValidationError(
          "damaged_image",
          "PNG 圖片缺少正確的標頭",
        );
      }
      assertReasonableDimensions(
        buffer.readUInt32BE(dataStart),
        buffer.readUInt32BE(dataStart + 4),
      );
    }
    if (type === "acTL") {
      throw new InvoiceImageValidationError(
        "animated_image_not_supported",
        "目前不接受動畫圖片",
      );
    }
    if (type === "IDAT") hasImageData = true;
    if (type === "IEND") {
      if (length !== 0 || dataEnd + 4 !== buffer.length) {
        throw new InvoiceImageValidationError(
          "damaged_image",
          "PNG 圖片結尾無效",
        );
      }
      hasEnd = true;
      break;
    }
    position = dataEnd + 4;
    chunkIndex++;
  }

  if (!hasImageData || !hasEnd) {
    throw new InvoiceImageValidationError(
      "damaged_image",
      "PNG 圖片缺少必要的影像資料",
    );
  }
  return { mimeType: "image/png", extension: "png" };
}

function isWebpStart(buffer: Buffer): boolean {
  return (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP"
  );
}

function readUInt24LE(buffer: Buffer, offset: number): number {
  return (
    buffer[offset] | (buffer[offset + 1] << 8) | (buffer[offset + 2] << 16)
  );
}

function validateWebp(buffer: Buffer): ImageStructure {
  if (buffer.length < 20 || buffer.readUInt32LE(4) + 8 !== buffer.length) {
    throw new InvoiceImageValidationError(
      "damaged_image",
      "WebP 圖片長度無效",
    );
  }

  let position = 12;
  let hasImageData = false;
  while (position + 8 <= buffer.length) {
    const type = buffer.subarray(position, position + 4).toString("ascii");
    const length = buffer.readUInt32LE(position + 4);
    const dataStart = position + 8;
    const dataEnd = dataStart + length;
    const paddedEnd = dataEnd + (length % 2);
    if (paddedEnd > buffer.length) {
      throw new InvoiceImageValidationError(
        "damaged_image",
        "WebP 圖片區段不完整",
      );
    }
    if (type === "ANIM" || type === "ANMF") {
      throw new InvoiceImageValidationError(
        "animated_image_not_supported",
        "目前不接受動畫圖片",
      );
    }
    if (type === "VP8X") {
      if (length < 10) {
        throw new InvoiceImageValidationError(
          "damaged_image",
          "WebP 圖片標頭不完整",
        );
      }
      if ((buffer[dataStart] & 0x02) !== 0) {
        throw new InvoiceImageValidationError(
          "animated_image_not_supported",
          "目前不接受動畫圖片",
        );
      }
      assertReasonableDimensions(
        readUInt24LE(buffer, dataStart + 4) + 1,
        readUInt24LE(buffer, dataStart + 7) + 1,
      );
    } else if (type === "VP8 ") {
      if (
        length < 10 ||
        buffer[dataStart + 3] !== 0x9d ||
        buffer[dataStart + 4] !== 0x01 ||
        buffer[dataStart + 5] !== 0x2a
      ) {
        throw new InvoiceImageValidationError(
          "damaged_image",
          "WebP VP8 影像資料無效",
        );
      }
      assertReasonableDimensions(
        buffer.readUInt16LE(dataStart + 6) & 0x3fff,
        buffer.readUInt16LE(dataStart + 8) & 0x3fff,
      );
      hasImageData = true;
    } else if (type === "VP8L") {
      if (length < 5 || buffer[dataStart] !== 0x2f) {
        throw new InvoiceImageValidationError(
          "damaged_image",
          "WebP VP8L 影像資料無效",
        );
      }
      const bits = buffer.readUInt32LE(dataStart + 1);
      assertReasonableDimensions((bits & 0x3fff) + 1, ((bits >> 14) & 0x3fff) + 1);
      hasImageData = true;
    }
    position = paddedEnd;
  }

  if (position !== buffer.length || !hasImageData) {
    throw new InvoiceImageValidationError(
      "damaged_image",
      "WebP 圖片缺少必要的影像資料",
    );
  }
  return { mimeType: "image/webp", extension: "webp" };
}

function detectAndValidate(buffer: Buffer): ImageStructure {
  if (isJpegStart(buffer)) return validateJpeg(buffer);
  if (isPngStart(buffer)) return validatePng(buffer);
  if (isWebpStart(buffer)) return validateWebp(buffer);
  throw new InvoiceImageValidationError(
    "unsupported_image_type",
    "僅支援 JPG、PNG、WebP；HEIC 請先轉成 JPG",
  );
}

function safeFilename(originalName: string, extension: string): string {
  const leaf = originalName.split(/[\\/]/).pop() ?? "";
  const withoutControlCharacters = leaf
    .normalize("NFKC")
    .replace(/[\u0000-\u001f\u007f]/g, "_")
    .replace(/[^\p{L}\p{N}._() -]/gu, "_")
    .trim()
    .slice(0, 160);
  const stem =
    withoutControlCharacters.replace(/\.[^.]*$/, "").trim() || "invoice";
  return `${stem.slice(0, 140)}.${extension}`;
}

export function validateInvoiceImage(input: {
  buffer: Buffer;
  declaredMimeType: string;
  originalName: string;
  maxFileBytes: number;
}): ValidatedInvoiceImage {
  if (!Buffer.isBuffer(input.buffer) || input.buffer.length === 0) {
    throw new InvoiceImageValidationError("missing_image", "請選擇一張發票照片");
  }
  if (input.buffer.length > input.maxFileBytes) {
    throw new InvoiceImageValidationError(
      "image_too_large",
      `圖片不可超過 ${Math.floor(input.maxFileBytes / 1024 / 1024)} MB`,
    );
  }
  if (
    !(SUPPORTED_INVOICE_MIME_TYPES as readonly string[]).includes(
      input.declaredMimeType,
    )
  ) {
    throw new InvoiceImageValidationError(
      "unsupported_image_type",
      "僅支援 JPG、PNG、WebP；HEIC 請先轉成 JPG",
    );
  }
  const detected = detectAndValidate(input.buffer);
  if (detected.mimeType !== input.declaredMimeType) {
    throw new InvoiceImageValidationError(
      "mime_type_mismatch",
      "圖片內容與檔案格式不一致",
    );
  }
  return {
    buffer: input.buffer,
    mimeType: detected.mimeType,
    safeFilename: safeFilename(input.originalName, detected.extension),
    sha256: createHash("sha256").update(input.buffer).digest("hex"),
    byteLength: input.buffer.length,
  };
}

export function invoiceImageToDataUrl(
  image: Pick<ValidatedInvoiceImage, "buffer" | "mimeType">,
): string {
  return `data:${image.mimeType};base64,${image.buffer.toString("base64")}`;
}
