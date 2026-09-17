import Decimal from 'decimal.js';

const Exact = Decimal.clone({ precision: 60, rounding: Decimal.ROUND_HALF_UP });
export function formatCatalogNumber(value: string | null | undefined, places: number): string {
  if (value == null || value === '') return '待確認';
  try { const d = new Exact(value); if (!d.isFinite()) return '待確認'; return d.toFixed(places).replace(/\B(?=(\d{3})+(?!\d))/g, ','); } catch { return '待確認'; }
}
export function catalogMoney(value: string | null | undefined, currency: 'JPY' | 'TWD' = 'JPY'): { text: string; spoken: string } {
  const formatted = formatCatalogNumber(value, currency === 'JPY' ? 0 : 2);
  if (formatted === '待確認') return { text: formatted, spoken: formatted };
  const negative = formatted.startsWith('-');
  const amount = negative ? formatted.slice(1) : formatted;
  return { text: `${negative ? '−' : ''}${currency === 'JPY' ? '¥' : 'NT$'}\u00a0${amount}`, spoken: `${negative ? '負 ' : ''}${amount} ${currency === 'JPY' ? '日圓' : '新台幣'}` };
}
export function catalogDateLabel(value: string | null | undefined) { return value ? value.slice(0, 10) : '日期待確認'; }
export const statusLabels = { NORMAL: '正常', DISCONTINUED: '店鋪停售', ARCHIVED: '封存' };
export function objectValue(value: unknown): Record<string, unknown> | undefined { return value !== null && typeof value === 'object' && !Array.isArray(value) ? Object.fromEntries(Object.entries(value)) : undefined; }
export function catalogError(error: unknown): string {
  const e = objectValue(error), body = objectValue(e?.data);
  if (e?.status === 401) return '登入已失效，請重新登入。';
  if (e?.status === 403) return '你沒有此店鋪的存取權限。';
  if (e?.status === 404) return '找不到此店鋪的資料，可能已變更或移除。';
  return typeof body?.error === 'string' ? body.error : '暫時無法完成，請確認連線後重試。';
}
export function duplicateDetails(error: unknown): { id: number; name: string; barcode: string }[] {
  const e=objectValue(error), details=objectValue(objectValue(e?.data)?.details);
  if(e?.status!==409 || details?.requiresForceCreate!==true || !Array.isArray(details.candidates)) return [];
  return details.candidates.flatMap(value=>{const x=objectValue(value);return typeof x?.id==='number'&&typeof x.name==='string'&&typeof x.barcode==='string'?[{id:x.id,name:x.name,barcode:x.barcode}]:[];});
}
export const decimalInput = (value: string, scale=12) => new RegExp(`^\\d{1,${scale===2?10:18}}(?:\\.\\d{1,${scale}})?$`).test(value);
// Canonicalize a suggested weight without rounding or changing the source value.
export function trimCatalogWeightZeros(value: string): string {
  return /^\d+\.\d+$/.test(value) ? value.replace(/0+$/, '').replace(/\.$/, '') : value;
}
export function validateCatalogBasics(v: {name:string;barcode:string;barcodeStatus:string;weightGrams:string;originalPriceJpy?:string}) {
  const errors:Record<string,string>={};
  if(!v.name.trim()) errors.name='請填寫商品名稱';
  if(v.barcodeStatus==='REAL'&&(!/^\d+$/.test(v.barcode)||v.barcode==='0')) errors.barcode='請填寫完整數字條碼，無條碼請改選「無條碼」';
  if(!decimalInput(v.weightGrams,2))errors.weightGrams='重量須為非負數，最多兩位小數';
  if(v.originalPriceJpy!==undefined&&!decimalInput(v.originalPriceJpy))errors.originalPriceJpy='原價須為非負十進位數';
  return errors;
}
