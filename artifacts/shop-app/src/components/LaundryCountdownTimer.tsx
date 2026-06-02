interface Props {
  remainingMs: number;
  closed: boolean;
  deadlineLabel: string;
}

function formatRemainingTime(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [
    String(hours).padStart(2, "0"),
    String(minutes).padStart(2, "0"),
    String(seconds).padStart(2, "0"),
  ].join(":");
}

export default function LaundryCountdownTimer({ remainingMs, closed, deadlineLabel }: Props) {
  const timeStr = formatRemainingTime(remainingMs);

  if (closed) {
    return (
      <div className="mt-3 mb-1 rounded-2xl bg-red-50 border-2 border-red-100 overflow-hidden select-none">
        <div className="px-4 py-3 text-center">
          <div className="text-base font-bold text-red-500">已截止收單</div>
          <div className="text-xs text-red-400 mt-0.5">此商品目前無法送出訂單。</div>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-3 mb-1 rounded-2xl overflow-hidden select-none">
      {/* GUGA countdown video + React time overlay */}
      <div className="relative w-full aspect-square">
        <video
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          className="absolute inset-0 w-full h-full object-cover"
          aria-hidden="true"
        >
          <source src="/videos/guga-countdown-loop.webm" type="video/webm" />
          <source src="/videos/guga-countdown-loop.mp4" type="video/mp4" />
        </video>

        {/* Time-only overlay on the black number panel (top area of video, ~16% from top) */}
        <div
          className="absolute left-0 right-0 flex justify-center pointer-events-none"
          style={{ top: "16%", transform: "translateY(-50%)" }}
        >
          <span
            className="font-mono font-bold text-[#ffd166] text-3xl tracking-[0.12em]"
            style={{ textShadow: "0 1px 6px rgba(0,0,0,0.7)" }}
          >
            {timeStr}
          </span>
        </div>
      </div>

      <div className="text-center py-2 text-[11px] text-[#a09080] bg-[#faf8f4]">
        收單截止：{deadlineLabel}
      </div>
    </div>
  );
}
