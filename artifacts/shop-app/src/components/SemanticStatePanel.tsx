import type { ReactNode } from "react";
import { CircleAlert, Info, RefreshCw } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export interface SemanticStateAction {
  label: string;
  onAction: () => void;
  disabled?: boolean;
  busy?: boolean;
}

export type SemanticState =
  | {
      kind: "pending";
      title: string;
      reason: string;
      action?: SemanticStateAction;
    }
  | {
      kind: "loading";
      label: string;
      skeleton?: ReactNode;
      fallbackMessage: string;
    }
  | {
      kind: "inlineError";
      title: string;
      message: string;
      preservedContent?: ReactNode;
      action?: SemanticStateAction;
    }
  | {
      kind: "empty";
      title: string;
      reason: string;
      scopeLabel?: string;
    }
  | {
      kind: "progress";
      workLabel: string;
      progressLabel: string;
      action?: SemanticStateAction;
    }
  | {
      kind: "pageError";
      title: string;
      message: string;
      retry: SemanticStateAction;
    }
  | {
      kind: "refreshing";
      label: string;
      lastUpdatedLabel: string;
      content: ReactNode;
    }
  | {
      kind: "emptyAction";
      title: string;
      reason: string;
      action: SemanticStateAction;
    }
  | {
      kind: "notice";
      message: string;
      content: ReactNode;
    };

export interface SemanticStatePanelProps {
  state: SemanticState;
  id?: string;
  className?: string;
}

function StateActionButton({ action }: { action: SemanticStateAction }) {
  return (
    <Button
      type="button"
      variant="outline"
      className="min-h-11 rounded-none disabled:border-border disabled:bg-muted disabled:text-muted-foreground disabled:opacity-100"
      onClick={action.onAction}
      disabled={action.disabled || action.busy}
      aria-busy={action.busy || undefined}
    >
      {action.label}
    </Button>
  );
}

export function SemanticStatePanel({
  state,
  id,
  className,
}: SemanticStatePanelProps) {
  const rootClassName = cn("min-w-0", className);

  switch (state.kind) {
    case "pending":
      return (
        <section
          id={id}
          className={cn(
            "border border-accent bg-accent/10 p-4 text-foreground",
            rootClassName,
          )}
          role="status"
          aria-live="polite"
          data-state="pending"
        >
          <div className="flex items-start gap-3">
            <Info className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
            <div className="min-w-0 flex-1 space-y-2">
              <p className="font-medium">{state.title}</p>
              <p className="text-sm text-muted-foreground">{state.reason}</p>
              {state.action ? (
                <StateActionButton action={state.action} />
              ) : null}
            </div>
          </div>
        </section>
      );

    case "loading":
      return (
        <section
          id={id}
          className={cn("space-y-3", rootClassName)}
          role="status"
          aria-live="polite"
          aria-busy="true"
          data-state="loading"
        >
          <p className="text-sm font-medium">{state.label}</p>
          <div aria-hidden="true">
            {state.skeleton ?? (
              <div className="space-y-2">
                <Skeleton className="h-11 rounded-none" />
                <Skeleton className="h-11 rounded-none" />
                <Skeleton className="h-11 w-2/3 rounded-none" />
              </div>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            {state.fallbackMessage}
          </p>
        </section>
      );

    case "inlineError":
      return (
        <section id={id} className={cn("space-y-3", rootClassName)}>
          {state.preservedContent}
          <Alert variant="destructive" className="rounded-none">
            <CircleAlert aria-hidden="true" />
            <AlertTitle>{state.title}</AlertTitle>
            <AlertDescription className="space-y-3">
              <p>{state.message}</p>
              {state.action ? (
                <StateActionButton action={state.action} />
              ) : null}
            </AlertDescription>
          </Alert>
        </section>
      );

    case "empty":
      return (
        <Empty id={id} className={cn("rounded-none border", rootClassName)}>
          <EmptyHeader>
            <EmptyTitle>{state.title}</EmptyTitle>
            <EmptyDescription>{state.reason}</EmptyDescription>
          </EmptyHeader>
          {state.scopeLabel ? (
            <EmptyContent className="text-muted-foreground">
              {state.scopeLabel}
            </EmptyContent>
          ) : null}
        </Empty>
      );

    case "progress":
      return (
        <section
          id={id}
          className={cn("border border-border p-4", rootClassName)}
          role="status"
          aria-live="polite"
          data-state="progress"
        >
          <div className="flex items-start gap-3">
            <RefreshCw className="mt-0.5 size-4 shrink-0" aria-hidden />
            <div className="min-w-0 flex-1 space-y-2">
              <p className="font-medium">{state.workLabel}</p>
              <p className="text-sm tabular-nums lining-nums">
                {state.progressLabel}
              </p>
              {state.action ? (
                <StateActionButton action={state.action} />
              ) : null}
            </div>
          </div>
        </section>
      );

    case "pageError":
      return (
        <Alert
          id={id}
          variant="destructive"
          className={cn("rounded-none", rootClassName)}
        >
          <CircleAlert aria-hidden="true" />
          <AlertTitle>{state.title}</AlertTitle>
          <AlertDescription className="space-y-3">
            <p>{state.message}</p>
            <StateActionButton action={state.retry} />
          </AlertDescription>
        </Alert>
      );

    case "refreshing":
      return (
        <section
          id={id}
          className={cn("space-y-3", rootClassName)}
          aria-busy="true"
          data-state="refreshing"
        >
          <div
            className="border border-border bg-secondary/50 p-3 text-sm"
            role="status"
            aria-live="polite"
          >
            <p className="font-medium">{state.label}</p>
            <p className="text-muted-foreground">{state.lastUpdatedLabel}</p>
          </div>
          {state.content}
        </section>
      );

    case "emptyAction":
      return (
        <Empty id={id} className={cn("rounded-none border", rootClassName)}>
          <EmptyHeader>
            <EmptyTitle>{state.title}</EmptyTitle>
            <EmptyDescription>{state.reason}</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <StateActionButton action={state.action} />
          </EmptyContent>
        </Empty>
      );

    case "notice":
      return (
        <section
          id={id}
          className={cn("space-y-3", rootClassName)}
          data-state="notice"
        >
          {state.content}
          <div
            className="border border-border bg-secondary/50 p-3 text-sm"
            role="status"
            aria-live="polite"
          >
            {state.message}
          </div>
        </section>
      );
  }
}
