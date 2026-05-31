import { S3Client } from "@aws-sdk/client-s3";

interface R2Config {
  client: S3Client;
  bucket: string;
  publicUrl: string;
}

let _config: R2Config | null | undefined = undefined;

function loadConfig(): R2Config | null {
  const accountId = process.env.CLOUDFLARE_R2_ACCOUNT_ID;
  const accessKeyId = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY;
  const bucket = process.env.CLOUDFLARE_R2_BUCKET_NAME;
  const publicUrl = process.env.CLOUDFLARE_R2_PUBLIC_URL;

  if (!accountId || !accessKeyId || !secretAccessKey || !bucket || !publicUrl) {
    return null;
  }

  return {
    client: new S3Client({
      region: "auto",
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId, secretAccessKey },
    }),
    bucket,
    publicUrl: publicUrl.replace(/\/$/, ""),
  };
}

export function getR2Config(): R2Config {
  if (_config === undefined) {
    _config = loadConfig();
  }
  if (_config === null) {
    throw new Error("R2_NOT_CONFIGURED");
  }
  return _config;
}
