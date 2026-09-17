/** Camera formats are explicit: manual and Code 128 inputs stay literal. */
export type BarcodeInputFormat = 'MANUAL' | 'EAN_8' | 'EAN_13' | 'UPC_A' | 'CODE_128';

export function barcodeLookupInput(raw: string, format: BarcodeInputFormat = 'MANUAL') {
  const barcode = raw.normalize('NFKC').trim();
  if (!/^[0-9]{1,128}$/.test(barcode) || barcode === '0') {
    throw new Error('請輸入純數字條碼；無條碼商品請使用手動搜尋。');
  }
  const candidates = [barcode];
  if (format === 'UPC_A' && barcode.length === 12) candidates.push('0' + barcode);
  if (format === 'EAN_13' && barcode.length === 13 && barcode.startsWith('0')) {
    candidates.push(barcode.slice(1));
  }
  return { barcode, format, candidates, requiresPrintedBarcodeConfirmation: candidates.length > 1 };
}
