import { TAIWAN_ZIPCODE_REGIONS, getDistricts } from "@/lib/taiwanZipcodes";

const INPUT =
  "w-full h-9 px-3 rounded-xl border border-input bg-secondary/40 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30";
const SELECT =
  "w-full h-9 px-3 rounded-xl border border-input bg-secondary/40 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 cursor-pointer";

interface Props {
  city: string;
  district: string;
  zip: string;
  addressLine: string;
  required?: boolean;
  addressLineLabel?: string;
  addressLinePlaceholder?: string;
  onCityChange: (city: string) => void;
  onDistrictChange: (district: string, zip: string) => void;
  onAddressLineChange: (line: string) => void;
}

// 與買家端（PublicOrder）相同的黑貓 / 郵局收件地址欄位：
// 縣市 / 行政區 / 郵遞區號（自動帶入）/ 詳細地址
export function RecipientAddressFields({
  city,
  district,
  zip,
  addressLine,
  required,
  addressLineLabel = "詳細地址",
  addressLinePlaceholder = "路名、門牌號、樓層，例如：信義路三段100號5樓",
  onCityChange,
  onDistrictChange,
  onAddressLineChange,
}: Props) {
  const districts = getDistricts(city);
  const star = required ? " *" : "";
  return (
    <>
      <div>
        <label className="block text-xs font-medium text-foreground mb-1">
          縣市{star}
        </label>
        <select
          value={city}
          onChange={(e) => onCityChange(e.target.value)}
          className={SELECT}
        >
          <option value="">請選擇縣市</option>
          {TAIWAN_ZIPCODE_REGIONS.map((r) => (
            <option key={r.city} value={r.city}>
              {r.city}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-xs font-medium text-foreground mb-1">
          行政區{star}
        </label>
        <select
          value={district}
          onChange={(e) => {
            const d = districts.find((x) => x.district === e.target.value);
            onDistrictChange(e.target.value, d?.zip ?? "");
          }}
          disabled={!city}
          className={`${SELECT} disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          <option value="">請選擇行政區</option>
          {districts.map((d) => (
            <option key={d.district} value={d.district}>
              {d.district}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-xs font-medium text-foreground mb-1">
          郵遞區號
        </label>
        <input
          type="text"
          value={zip}
          readOnly
          placeholder="選行政區後自動帶入"
          className={`${INPUT} bg-muted/30 cursor-default`}
        />
        <p className="text-[10px] text-muted-foreground mt-0.5">
          郵遞區號依縣市與行政區自動帶入
        </p>
      </div>
      <div>
        <label className="block text-xs font-medium text-foreground mb-1">
          {addressLineLabel}
          {star}
        </label>
        <input
          type="text"
          value={addressLine}
          onChange={(e) => onAddressLineChange(e.target.value)}
          placeholder={addressLinePlaceholder}
          className={INPUT}
        />
      </div>
    </>
  );
}
