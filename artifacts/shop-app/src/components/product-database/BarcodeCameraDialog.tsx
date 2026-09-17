import { useEffect, useRef } from "react";
import { Content } from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DialogPortal,
  DialogOverlay,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { startBarcodeCamera } from "@/lib/barcodeCamera";
import type { barcodeLookupInput } from "@/lib/barcode-input";

type CameraCallbacks = {
  onResult: (input: ReturnType<typeof barcodeLookupInput>) => void;
  onError: (message: string) => void;
};

// Mount with the portal's video node, never before the portal is attached.
function CameraFeed({ onResult, onError }: CameraCallbacks) {
  const video = useRef<HTMLVideoElement>(null);
  const callbacks = useRef({ onResult, onError });
  callbacks.current = { onResult, onError };
  useEffect(
    () => startBarcodeCamera(
      video.current!,
      (value) => callbacks.current.onResult(value),
      (message) => callbacks.current.onError(message),
    ),
    [],
  );
  return <video ref={video} muted playsInline autoPlay aria-label="條碼相機" className="absolute inset-0 h-full w-full object-cover" />;
}

export function BarcodeCameraDialog({
  onResult,
  onError,
  onClose,
  onManualInput,
  onReturnFocus,
}: CameraCallbacks & {
  onClose: () => void;
  onManualInput: () => void;
  onReturnFocus: () => void;
}) {
  return (
    <DialogPortal>
      <DialogOverlay className="z-[70]" />
      <Content
        className="fixed inset-0 z-[71] flex h-dvh w-full flex-col overflow-hidden bg-background text-foreground outline-none"
        onPointerDownOutside={(e) => e.preventDefault()}
        onCloseAutoFocus={(e) => {
          e.preventDefault();
          onReturnFocus();
        }}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <CameraFeed onResult={onResult} onError={onError} />
        <header className="relative z-10 flex shrink-0 items-center justify-between gap-3 bg-background/90 px-4 pb-3 pt-[calc(12px+env(safe-area-inset-top))]">
          <DialogTitle className="text-lg font-semibold">
            掃描商品條碼
          </DialogTitle>
          <Button
            type="button"
            variant="outline"
            className="min-h-11 min-w-11 gap-1"
            onClick={onClose}
          >
            <X className="h-5 w-5" aria-hidden="true" />
            關閉相機
          </Button>
        </header>
        <div
          className="pointer-events-none relative flex min-h-0 flex-1 items-center justify-center px-6"
          aria-hidden="true"
        >
          <div className="h-[min(32dvh,180px)] w-full max-w-md rounded-2xl border-2 border-primary shadow-[0_0_0_100vmax_rgb(0_0_0/0.35)]" />
        </div>
        <footer className="relative z-10 shrink-0 space-y-3 bg-background/90 px-4 pt-4 pb-[calc(20px+env(safe-area-inset-bottom))] text-center">
          <DialogDescription className="text-base text-foreground">
            將商品條碼放入框內，辨識成功後會自動查詢。
          </DialogDescription>
          <p className="text-sm text-secondary-foreground">
            保持畫面清晰，稍微移動距離即可。
          </p>
          <Button
            type="button"
            variant="outline"
            className="min-h-11 w-full max-w-md"
            onClick={onManualInput}
          >
            改用手動輸入
          </Button>
        </footer>
      </Content>
    </DialogPortal>
  );
}
