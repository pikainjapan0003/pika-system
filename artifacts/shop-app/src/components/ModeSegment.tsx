export type KpiMode = "estimate" | "actual" | "difference";

const MODE_OPTIONS: Array<{ value: KpiMode; label: string }> = [
  { value: "estimate", label: "預估" },
  { value: "actual", label: "實際" },
  { value: "difference", label: "差異" },
];

export function ModeSegment({
  value,
  onChange,
}: {
  value: KpiMode;
  onChange: (value: KpiMode) => void;
}) {
  return (
    <div
      className="grid grid-cols-3 gap-1 rounded-xl border border-border bg-muted p-1"
      role="group"
      aria-label="KPI 資料模式"
    >
      {MODE_OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          aria-pressed={value === option.value}
          className={`min-h-11 rounded-lg px-3 text-sm font-semibold transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none ${
            value === option.value
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-background hover:text-foreground active:bg-background"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
