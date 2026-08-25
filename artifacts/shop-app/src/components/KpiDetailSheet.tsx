import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

export interface KpiDetail {
  key: string;
  label: string;
  value: string;
  comparison: string;
  formula: string;
  source: string;
  scope: string;
  updatedAt: string;
  mode: string;
}

export function KpiDetailSheet({
  detail,
  open,
  onOpenChange,
}: {
  detail: KpiDetail | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="mx-auto h-[70dvh] w-full max-w-3xl overflow-y-auto rounded-t-[20px] border-border bg-background pb-[calc(24px+env(safe-area-inset-bottom))] motion-reduce:transition-none"
        data-testid="bottom-sheet"
      >
        <SheetHeader className="border-b border-border pb-4 pr-8 text-left">
          <SheetTitle>{detail?.label ?? "指標明細"}</SheetTitle>
          <SheetDescription className="tabular-nums lining-nums">
            {detail
              ? `${detail.value} · ${detail.comparison}`
              : "選擇核心 KPI 查看明細"}
          </SheetDescription>
        </SheetHeader>

        <dl className="mt-2 divide-y divide-border">
          {[
            ["公式", detail?.formula ?? "待確認"],
            ["資料來源", detail?.source ?? "待確認"],
            ["涵蓋範圍", detail?.scope ?? "待確認"],
            ["最後更新時間", detail?.updatedAt ?? "待確認"],
            ["是否為預估或實際或差異", detail?.mode ?? "待確認"],
          ].map(([term, description]) => (
            <div
              key={term}
              className="grid min-h-16 grid-cols-[minmax(96px,0.42fr)_minmax(0,1fr)] gap-4 py-4"
            >
              <dt className="text-xs text-muted-foreground">{term}</dt>
              <dd className="m-0 text-right text-sm text-foreground">
                {description}
              </dd>
            </div>
          ))}
        </dl>
      </SheetContent>
    </Sheet>
  );
}
