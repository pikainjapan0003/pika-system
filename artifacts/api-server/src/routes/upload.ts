import { Router } from "express";
import multer from "multer";
import { rateLimit } from "express-rate-limit";
import { randomBytes } from "crypto";
import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { requireAuth, verifyStoreOwner } from "../middlewares/auth.ts";
import { getR2Config } from "../lib/r2.ts";
import { isPocStore, privatePocConfig } from "../lib/privatePoc.ts";

const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_SIZE_BYTES = 5 * 1024 * 1024;

const MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

const multerUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_SIZE_BYTES },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME_TYPES.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("INVALID_TYPE"));
    }
  },
});

function parseMulter(req: any, res: any): Promise<void> {
  return new Promise((resolve, reject) => {
    multerUpload.single("image")(req, res, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

const uploadLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  handler: (_req, res) => {
    res
      .status(429)
      .json({ error: "Too many upload requests, please try again later." });
  },
});

const router = Router();

// Stable same-origin image URLs work with <img> and the Sites PRIVATE session.
// The existing POC gateway protects this route; uploads still require the owner.
router.get("/poc/images/products/:storeId/:filename", async (req, res) => {
  if (!privatePocConfig()) return res.sendStatus(404);
  const storeId = Number(req.params.storeId);
  const filename = req.params.filename;
  const match = /^(\d{13}-[a-f0-9]{16})\.(jpg|png|webp)$/.exec(filename);
  if (!Number.isSafeInteger(storeId) || storeId <= 0 ||
      String(storeId) !== req.params.storeId || !isPocStore(storeId) || !match) {
    return res.sendStatus(404);
  }
  try {
    const config = getR2Config();
    const object = await config.client.send(new GetObjectCommand({
      Bucket: config.bucket,
      Key: `products/${storeId}/${filename}`,
    }));
    if (!object.Body || (object.ContentLength ?? 0) > MAX_SIZE_BYTES) {
      return res.status(502).json({ error: "Invalid stored image" });
    }
    const bytes = Buffer.from(await object.Body.transformToByteArray());
    if (bytes.length === 0 || bytes.length > MAX_SIZE_BYTES) {
      return res.status(502).json({ error: "Invalid stored image" });
    }
    const type = match[2] === "jpg" ? "image/jpeg" : `image/${match[2]}`;
    res.setHeader("Content-Type", type);
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    return res.send(bytes);
  } catch (error) {
    const status = (error as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode;
    if (status === 404 || (error as Error)?.name === "NoSuchKey") return res.sendStatus(404);
    return res.status(503).json({ error: "Image storage unavailable" });
  }
});

router.post(
  "/stores/:storeId/products/image",
  requireAuth,
  uploadLimiter,
  async (req: any, res: any) => {
    const storeId = parseInt(req.params.storeId);
    if (isNaN(storeId))
      return res.status(400).json({ error: "Invalid storeId" });

    if (!(await verifyStoreOwner(req, res, storeId))) return;

    let r2Config;
    try {
      r2Config = getR2Config();
    } catch {
      return res.status(500).json({ error: "Storage is not configured" });
    }

    try {
      await parseMulter(req, res);
    } catch (err: unknown) {
      if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
        return res.status(400).json({ error: "File too large" });
      }
      if (err instanceof Error && err.message === "INVALID_TYPE") {
        return res.status(400).json({ error: "Invalid file type" });
      }
      return res.status(400).json({ error: "Upload error" });
    }

    if (!req.file) {
      return res.status(400).json({ error: "No file provided" });
    }

    const ext = MIME_TO_EXT[req.file.mimetype] ?? "jpg";
    const key = `products/${storeId}/${Date.now()}-${randomBytes(8).toString("hex")}.${ext}`;

    try {
      await r2Config.client.send(
        new PutObjectCommand({
          Bucket: r2Config.bucket,
          Key: key,
          Body: req.file.buffer,
          ContentType: req.file.mimetype,
        }),
      );
      return res.status(201).json({ imageUrl: `${r2Config.publicUrl}/${key}` });
    } catch {
      return res.status(500).json({ error: "Upload failed" });
    }
  },
);

export default router;
