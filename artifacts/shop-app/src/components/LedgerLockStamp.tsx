import { useId } from "react";
import { LockKeyhole } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

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

  if (!props.estimateLocked) {
    return null;
  }

  const reasonId = `ledger-lock-reason-${generatedId}`;
  const visibleReason = props.reason.trim() || "鎖定原因待確認。";

  return (
    <section
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
