import { useRef, type TouchEvent } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export type AnalysisCategory = "overview" | "profit" | "cost" | "trend";

const CATEGORY_OPTIONS: Array<{
  value: AnalysisCategory;
  label: string;
}> = [
  { value: "overview", label: "概覽" },
  { value: "profit", label: "損益" },
  { value: "cost", label: "成本" },
  { value: "trend", label: "趨勢" },
];

export function AnalysisTabs({
  value,
  onChange,
  children,
}: {
  value: AnalysisCategory;
  onChange: (value: AnalysisCategory) => void;
  children: React.ReactNode;
}) {
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  const handleTouchStart = (event: TouchEvent<HTMLDivElement>) => {
    const touch = event.changedTouches[0];
    touchStart.current = touch ? { x: touch.clientX, y: touch.clientY } : null;
  };

  const handleTouchEnd = (event: TouchEvent<HTMLDivElement>) => {
    const start = touchStart.current;
    const touch = event.changedTouches[0];
    touchStart.current = null;
    if (!start || !touch) return;

    const deltaX = touch.clientX - start.x;
    const deltaY = touch.clientY - start.y;
    if (Math.abs(deltaX) < 48 || Math.abs(deltaX) <= Math.abs(deltaY)) return;

    const currentIndex = CATEGORY_OPTIONS.findIndex(
      (option) => option.value === value,
    );
    const nextIndex = deltaX < 0 ? currentIndex + 1 : currentIndex - 1;
    const next = CATEGORY_OPTIONS[nextIndex];
    if (!next) return;

    event.preventDefault();
    onChange(next.value);
  };

  return (
    <div
      className="touch-pan-y"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={() => {
        touchStart.current = null;
      }}
    >
      <Tabs
        value={value}
        onValueChange={(next) => onChange(next as AnalysisCategory)}
        className="w-full"
      >
        <TabsList
          className="grid h-auto w-full grid-cols-4 rounded-xl border border-border bg-muted p-1"
          aria-label="KPI 分類"
        >
          {CATEGORY_OPTIONS.map((option) => (
            <TabsTrigger
              key={option.value}
              value={option.value}
              className="min-h-11 px-2 text-sm data-[state=active]:bg-background data-[state=active]:text-primary motion-reduce:transition-none"
              data-testid={`tab-${option.value}`}
            >
              {option.label}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent
          value={value}
          forceMount
          className="mt-6 data-[state=inactive]:hidden"
        >
          {children}
        </TabsContent>
      </Tabs>
    </div>
  );
}
