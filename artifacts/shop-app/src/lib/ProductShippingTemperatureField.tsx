export type ProductShippingTemperatureClass = "normal" | "frozen" | null;

interface ProductShippingTemperatureFieldProps {
  value: ProductShippingTemperatureClass;
  onChange: (value: ProductShippingTemperatureClass) => void;
}

const OPTIONS: Array<{
  value: ProductShippingTemperatureClass;
  label: string;
}> = [
  { value: null, label: "未設定" },
  { value: "normal", label: "常溫" },
  { value: "frozen", label: "冷凍" },
];

export function ProductShippingTemperatureField({
  value,
  onChange,
}: ProductShippingTemperatureFieldProps) {
  return (
    <fieldset>
      <legend className="block text-xs text-muted-foreground mb-1.5">
        賣貨便溫層
      </legend>
      <div className="grid grid-cols-3 gap-2">
        {OPTIONS.map((option) => (
          <button
            key={option.value ?? "unset"}
            type="button"
            aria-pressed={value === option.value}
            onClick={() => onChange(option.value)}
            className={`min-h-11 rounded-xl text-sm font-medium border transition-colors ${
              value === option.value
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-secondary/60 text-foreground border-border"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground mt-1.5">
        僅供賣貨便匯出使用；未設定時該商品無法匯出。
      </p>
    </fieldset>
  );
}
