import { useEffect, useRef, useId } from "react";
import { LockKeyhole } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { K_DURATION, loadMotion, motionEnabled, PIKA_EASE } from "@/lib/motion";

export interface LedgerLockAction {
  label: string;
  onAction: () => void;
  disabled?: boolean;
  busy?: boolean;
}

export type LedgerLockStampProps =
  | {
      estimateLocked: false;
      className?: string;
    }
  | {
      estimateLocked: true;
      reason: string;
      lockedAtLabel?: string;
      action?: LedgerLockAction;
      className?: string;
    };

export function LedgerLockStamp(props: LedgerLockStampProps) {
  const generatedId = useId();
  const rootRef = useRef<HTMLElement>(null);

  // K7｜LedgerLockStamp 落印（K09 總帳落印鎖定的專用實例）：
  // estimateLocked 專用、掛載即落印一次（≈240ms，ease-out），不循環。
  useEffect(() => {
    const root = rootRef.current;
    if (!root || !motionEnabled()) return;
    let tl: { kill: () => void } | undefined;
    void loadMotion().then(({ gsap }) => {
      if (!gsap) return;
      tl = gsap.fromTo(
        root,
        { scale: 0.94, opacity: 0.001, transformOrigin: "50% 30%" },
        {
          scale: 1,
          opacity: 1,
          duration: K_DURATION.stamp,
          ease: PIKA_EASE.strongOut,
        },
      );
    });
    return () => {
      tl?.kill();
    };
  }, []);

  if (!props.estimateLocked) {
    return null;
  }

  const reasonId = `ledger-lock-reason-${generatedId}`;
  const visibleReason = props.reason.trim() || "鎖定原因待確認。";

  return (
    <section
      ref={rootRef}
      className={cn(
        "flex min-w-0 flex-col gap-3 border border-border bg-secondary/50 p-4 text-foreground",
        props.className,
      )}
      role="status"
      aria-live="polite"
      aria-describedby={reasonId}
      data-slot="ledger-lock-stamp"
      data-state="locked"
    >
      <div className="flex flex-wrap items-center gap-2">
        <Badge
          variant="outline"
          className="rounded-none border-primary text-foreground"
        >
          <LockKeyhole className="size-3.5" aria-hidden="true" />
          預估已鎖定
        </Badge>
        {props.lockedAtLabel ? (
          <span className="text-xs text-muted-foreground tabular-nums lining-nums">
            {props.lockedAtLabel}
          </span>
        ) : null}
      </div>
      <p id={reasonId} className="text-sm text-muted-foreground">
        {visibleReason}
      </p>
      {props.action ? (
        <Button
          type="button"
          variant="outline"
          className="min-h-11 self-start rounded-none disabled:border-border disabled:bg-muted disabled:text-muted-foreground disabled:opacity-100"
          onClick={props.action.onAction}
          disabled={props.action.disabled || props.action.busy}
          aria-busy={props.action.busy || undefined}
        >
          {props.action.label}
        </Button>
      ) : null}
    </section>
  );
}
