import { useEffect, useState, type ImgHTMLAttributes } from "react";
import { useAuth } from "@clerk/react";

// Synthetic R2 images remain private even when the brand entrance is public.
// Resolve the stable API path locally; never send a bearer to a supplied host.
export default function ProductImage({ src, ...props }: ImgHTMLAttributes<HTMLImageElement>) {
  const { getToken, isLoaded } = useAuth();
  const [loaded, setLoaded] = useState<{ source: string; url: string } | null>(null);
  const path = src ? new URL(src, window.location.origin).pathname : "";
  const privatePath = /^\/api\/poc\/images\/products\/\d+\/[^/]+$/.test(path);
  useEffect(() => {
    if (!privatePath || !src || !isLoaded) return;
    const abort = new AbortController();
    let blobUrl: string | undefined;
    void (async () => {
      const token = await getToken();
      const response = await fetch(path, { signal: abort.signal,
        headers: token ? { authorization: `Bearer ${token}` } : {} });
      if (!response.ok) throw new Error("Image unavailable");
      const blob = await response.blob();
      if (abort.signal.aborted) return;
      blobUrl = URL.createObjectURL(blob);
      setLoaded({ source: src, url: blobUrl });
    })().catch(() => { if (!abort.signal.aborted) setLoaded(null); });
    return () => { abort.abort(); if (blobUrl) URL.revokeObjectURL(blobUrl); };
  }, [src, path, privatePath, isLoaded, getToken]);
  return <img {...props} src={privatePath ? (loaded && loaded.source === src ? loaded.url : undefined) : src} />;
}
