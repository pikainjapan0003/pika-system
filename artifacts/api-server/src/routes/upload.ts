import { Router } from "express";
import multer from "multer";
import { rateLimit } from "express-rate-limit";
import { randomBytes } from "crypto";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { requireAuth, verifyStoreOwner } from "../middlewares/auth.ts";
import { getR2Config } from "../lib/r2.ts";

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
