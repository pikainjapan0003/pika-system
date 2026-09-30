import { ExactDecimal } from "../transport-cost/index.ts";

export class CatalogError extends Error {
  constructor(public status: number, message: string, public details?: unknown) { super(message); }
}
export function normalizeCatalog(value: string): string {
  return value.normalize("NFKC").trim().toLowerCase()
    .replace(/[\p{P}\p{S}]/gu, c => c === "%" || c === "_" ? c : " ")
    .replace(/\s+/g, " ").replace(/(\d)\s+(ml|mg|kg|g|l|入|個|枚|本|件)\b/gi, "$1$2")
    .replace(/(\d)\s+(入|個|枚|本|件)/g, "$1$2").trim();
}
export function catalogName(value: string): string {
  const name=value.normalize("NFKC").trim().replace(/\s+/g," ");
  if (!name || name.length>256 || !normalizeCatalog(name)) throw new CatalogError(400,"商品名稱不可為空白或只有標點");
  return name;
}
export function catalogBarcode(value: string, status: string): string {
  const barcode=value.normalize("NFKC").trim();
  if (status === "NONE" && barcode === "0") return barcode;
  if (status !== "REAL" || !/^[0-9]+$/.test(barcode) || barcode === "0" || barcode.length>128) throw new CatalogError(400,"請輸入純數字條碼，無條碼請選擇 NONE / 0");
  return barcode;
}
export function catalogDecimal(value: unknown, scale=12, signed=false): string {
  if(typeof value!=="string" || value.length>64 || !(signed?/^-?\d+(?:\.\d+)?$/:/^\d+(?:\.\d+)?$/).test(value)) throw new CatalogError(400,"金額或重量必須是有限十進位字串");
  const [integer,fraction=""]=value.replace(/^-/,'').split('.');
  if(fraction.length>scale || integer.replace(/^0+/,"").length>(scale===2?10:18)) throw new CatalogError(400,`數值超出範圍或超過 ${scale} 位小數`);
  return ExactDecimal.from(value).toDecimalPlaces(scale);
}
export function catalogDate(value?: string | null): string | null {
  if(value==null)return null;
  if(!/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000'))throw new CatalogError(400,"日期須為 YYYY-MM-DD");
  const d=new Date(value+'T00:00:00Z');
  if(!Number.isFinite(d.valueOf()) || d.toISOString().slice(0,10)!==value)throw new CatalogError(400,"日期不存在");
  return value;
}
export function catalogCost(input: {originalPriceJpy:string;adjustmentMode?:string;adjustmentRate?:string|null;effectiveCostJpy?:string|null}) {
  const original=catalogDecimal(input.originalPriceJpy), mode=input.adjustmentMode??'NONE';
  let rate:string|null=null,effective=original;
  if(mode==='RATE') {if(input.adjustmentRate==null)throw new CatalogError(400,"RATE 必須提供倍率");rate=catalogDecimal(input.adjustmentRate);effective=ExactDecimal.from(original).multiply(ExactDecimal.from(rate)).toDecimalPlaces(12);}
  else if(mode==='MANUAL'){if(input.effectiveCostJpy==null)throw new CatalogError(400,"MANUAL 必須提供有效成本");effective=catalogDecimal(input.effectiveCostJpy);}
  else if(mode!=='NONE')throw new CatalogError(400,"未知成本調整模式");
  effective=catalogDecimal(effective);
  if(mode!=='MANUAL' && input.effectiveCostJpy!=null && catalogDecimal(input.effectiveCostJpy)!==effective)throw new CatalogError(400,"有效成本與原價／倍率不一致");
  if(mode!=='RATE' && input.adjustmentRate!=null)throw new CatalogError(400,"此模式不接受倍率");
  return {original,effective,mode,rate};
}
export function catalogReason(input:{reasonCode?:string;reasonText?:string|null}) {
  const code=input.reasonCode?.trim();
  if(!code || (code==='OTHER' && !input.reasonText?.trim()))throw new CatalogError(400,"請提供原因，OTHER 必須填寫說明");
  return {code,text:input.reasonText?.trim()||null};
}
export function literalLike(value:string):string{return value.replace(/[\\%_]/g,"\\$&");}
