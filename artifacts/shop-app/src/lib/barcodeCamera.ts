import { barcodeLookupInput, type BarcodeInputFormat } from "./barcode-input";

type Controls = { stop(): void };
type Decoded = { getText(): string; getBarcodeFormat(): unknown };
export type CameraDependencies = {
  secure(): boolean;
  stream(): Promise<MediaStream>;
  decoder(): Promise<{
    decode(
      stream: MediaStream,
      video: HTMLVideoElement,
      callback: (
        result?: Decoded,
        error?: unknown,
        controls?: Controls,
      ) => void,
    ): Promise<Controls>;
    format(value: unknown): BarcodeInputFormat | undefined;
  }>;
  window: Pick<Window, "addEventListener" | "removeEventListener">;
  document: Pick<
    Document,
    "addEventListener" | "removeEventListener" | "visibilityState"
  >;
  timeoutMs?: number;
};
const defaults: CameraDependencies = {
  secure: () =>
    window.isSecureContext && !!navigator.mediaDevices?.getUserMedia,
  stream: () =>
    navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: { ideal: "environment" } },
    }),
  async decoder() {
    const [{ BrowserMultiFormatReader }, { BarcodeFormat }] = await Promise.all(
      [import("@zxing/browser"), import("@zxing/library")],
    );
    const reader = new BrowserMultiFormatReader();
    reader.possibleFormats = [
      BarcodeFormat.EAN_8,
      BarcodeFormat.EAN_13,
      BarcodeFormat.UPC_A,
      BarcodeFormat.CODE_128,
    ];
    return {
      decode: (stream, video, callback) =>
        reader.decodeFromStream(stream, video, callback),
      format: (value) => {
        if (value === BarcodeFormat.EAN_8) return "EAN_8";
        if (value === BarcodeFormat.EAN_13) return "EAN_13";
        if (value === BarcodeFormat.UPC_A) return "UPC_A";
        if (value === BarcodeFormat.CODE_128) return "CODE_128";
        return undefined;
      },
    };
  },
  get window() {
    return window;
  },
  get document() {
    return document;
  },
};

/** A session owns its video node, stream and controls, including late arrivals. */
export function startBarcodeCamera(
  video: HTMLVideoElement,
  onResult: (input: ReturnType<typeof barcodeLookupInput>) => void,
  onError: (message: string) => void,
  deps: CameraDependencies = defaults,
): () => void {
  let alive = true;
  const tracks = new Set<MediaStreamTrack>(),
    stoppedTracks = new Set<MediaStreamTrack>();
  const controls = new Set<Controls>(),
    stoppedControls = new Set<Controls>();
  const stopTrack = (track: MediaStreamTrack) => {
    if (!stoppedTracks.has(track)) {
      stoppedTracks.add(track);
      try {
        track.stop();
      } catch {}
    }
  };
  const stopControl = (control: Controls) => {
    if (!stoppedControls.has(control)) {
      stoppedControls.add(control);
      try {
        control.stop();
      } catch {}
    }
  };
  const acceptControl = (control?: Controls) => {
    if (control) {
      controls.add(control);
      if (!alive) stopControl(control);
    }
  };
  const hidden = () => {
    if (deps.document.visibilityState === "hidden") stop();
  };
  const timer = setTimeout(
    () => fail("掃描已逾時，請重試或手動輸入條碼。"),
    deps.timeoutMs ?? 45000,
  );
  function stop() {
    alive = false;
    clearTimeout(timer);
    deps.window.removeEventListener("pagehide", stop);
    deps.document.removeEventListener("visibilitychange", hidden);
    controls.forEach(stopControl);
    tracks.forEach(stopTrack);
    video.srcObject = null;
  }
  function fail(message: string) {
    if (!alive) return;
    stop();
    onError(message);
  }
  deps.window.addEventListener("pagehide", stop);
  deps.document.addEventListener("visibilitychange", hidden);
  void (async () => {
    try {
      if (!deps.secure()) {
        fail("相機需要安全連線及支援的瀏覽器，請手動輸入條碼。");
        return;
      }
      const decoder = await deps.decoder();
      if (!alive) return;
      const stream = await deps.stream();
      stream.getTracks().forEach((track) => {
        tracks.add(track);
        if (!alive) stopTrack(track);
      });
      if (!alive) return;
      video.srcObject = stream;
      const control = await decoder.decode(
        stream,
        video,
        (result, error, callbackControls) => {
          acceptControl(callbackControls);
          if (!alive) return;
          if (!result) {
            const benign = [
              "NotFoundException",
              "ChecksumException",
              "FormatException",
            ];
            const exception = error as
              | { getKind?: () => string; name?: string }
              | undefined;
            const kind =
              typeof exception?.getKind === "function"
                ? exception.getKind()
                : exception?.name;
            if (error && !benign.includes(kind ?? ""))
              fail("相機辨識發生錯誤，請重試或手動輸入條碼。");
            return;
          }
          const format = decoder.format(result.getBarcodeFormat());
          if (!format) return;
          try {
            const input = barcodeLookupInput(result.getText(), format);
            stop();
            onResult(input);
          } catch {
            fail("此條碼無法查詢，請改用手動輸入或名稱搜尋。");
          }
        },
      );
      acceptControl(control);
    } catch {
      fail("無法使用相機，請允許相機權限、確認裝置，或手動輸入條碼。");
    }
  })();
  return stop;
}
