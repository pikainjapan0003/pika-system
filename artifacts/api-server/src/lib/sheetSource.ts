import {Worker} from 'node:worker_threads';
import {createHash} from 'node:crypto';
import {CatalogError,normalizeCatalog,catalogDecimal} from '@workspace/db/catalog';
export type Cell={row:number;column:number;type:string;value:any;formula?:string|null;cachedValue?:any;numericLexeme?:string|null;style?:string|null};
export const LIMITS={rows:500,columns:64,cells:10000,text:4096,formula:2048,file:2097152,time:12000};
export function canonical(value:any):string {if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';return JSON.stringify(value);}
export const sha=(value:string|Buffer)=>createHash('sha256').update(value).digest('hex');
export function readWorkbook(buffer:Buffer,sheetTitle?:string):Promise<any>{return new Promise((resolve,reject)=>{
 const worker=new Worker(new URL('./sheetWorkbookWorker.mjs',import.meta.url),{execArgv:[],workerData:{buffer,sheetTitle},resourceLimits:{maxOldGenerationSizeMb:128,maxYoungGenerationSizeMb:32}});
 let done=false;const finish=(error:any,value?:any)=>{if(done)return;done=true;clearTimeout(timer);void worker.terminate().then(()=>error?reject(new CatalogError(400,String(error))):resolve(value));};
 const timer=setTimeout(()=>finish('試算表解析超過 12 秒上限'),LIMITS.time);worker.once('error',(e:Error)=>finish(e.message));worker.once('exit',code=>{if(!done)finish('試算表解析程序結束 '+code);});worker.once('message',m=>finish(m.error,m.result));
});}
export function validateCells(input:any):Cell[]{
 if(!Array.isArray(input)||input.length>LIMITS.cells)throw new CatalogError(400,'儲存格數超限');const seen=new Set<string>();
 return input.map(c=>{if(!c||!Number.isInteger(c.row)||c.row<1||c.row>LIMITS.rows||!Number.isInteger(c.column)||c.column<1||c.column>LIMITS.columns)throw new CatalogError(400,'列／欄超限');
 const k=c.row+':'+c.column;if(seen.has(k))throw new CatalogError(400,'重複儲存格');seen.add(k);
 if(!['n','s','str','inlineStr','b','e','text','number','boolean','blank'].includes(c.type)||![c.value,c.cachedValue].every(v=>v==null||typeof v==='string'||typeof v==='number'&&Number.isFinite(v)||typeof v==='boolean'))throw new CatalogError(400,'儲存格型別錯誤');
 if([c.value,c.cachedValue].some(v=>typeof v==='string'&&v.length>LIMITS.text)||c.formula!=null&&(typeof c.formula!=='string'||c.formula.length>LIMITS.formula))throw new CatalogError(400,'文字／公式超限');
 // XML numeric lexemes are server-owned, never accepted from structured input.
 return {row:c.row,column:c.column,type:c.type,value:c.value??null,formula:c.formula??null,cachedValue:c.cachedValue??null};
 }).sort((a,b)=>a.row-b.row||a.column-b.column);
}
export function sourceRows(cells:Cell[]){
 const rows:any[]=[];for(let row=1;row<=Math.max(0,...cells.map(c=>c.row));row++){
  const raw=cells.filter(c=>c.row===row),warnings:string[]=[];const cell=(col:number)=>raw.find(c=>c.column===col);
  const value=(col:number)=>{const c=cell(col);if(!c)return null;if(c.formula&&c.cachedValue==null){warnings.push('第 '+col+' 欄公式沒有 cached value，保持未知');return null;}return c.formula?c.cachedValue:c.value;};
  const text=(col:number)=>{const v=value(col);return v==null?'':String(v).trim();};
  const decimal=(col:number,scale=12)=>{const c=cell(col),v=value(col);if(v==null||v==='')return null;try{if(typeof v==='number'&&(!Number.isSafeInteger(v)&&Math.abs(v)>=Number.MAX_SAFE_INTEGER)){warnings.push('第 '+col+' 欄 numeric 精度不可確認，請人工更正');return null;}
   const lex=c?.numericLexeme??String(v);if(/[eE]/.test(lex)){warnings.push('第 '+col+' 欄科學記號需人工更正');return null;}return catalogDecimal(lex,scale);}catch{warnings.push('第 '+col+' 欄格式／精度需人工更正');return null;}};
  const name=text(3),barcodeRaw=text(2),original=decimal(4),weight=decimal(5,2),effective=decimal(6);
  let barcode=barcodeRaw,barcodeStatus='REAL';const bc=cell(2);if(!barcode||barcode==='-'){barcode='0';barcodeStatus='NONE';warnings.push('無條碼候選，必須人工確認');}
  else if(/^\d+-/.test(barcode)){barcode=barcode.split('-')[0];warnings.push('複合條碼已提出拆分候選，請確認');}
  if(bc&&['n','number'].includes(bc.type)&&(!/^\d+$/.test(barcode)||barcode.length>15||Number(barcode)>Number.MAX_SAFE_INTEGER)){barcode='';warnings.push('numeric 條碼精度不可恢復，請以文字人工更正');}
  if(barcodeStatus==='REAL'&&!/^[0-9]+$/.test(barcode)){barcode='';warnings.push('條碼需人工更正');}
  if(bc&&['n','number'].includes(bc.type))warnings.push('numeric 條碼可能已失去前導 0，請確認原始文字');
  const nonempty=raw.some(c=>c.value!=null&&c.value!==''||c.formula);let kind=!nonempty?'EMPTY':/^(名稱|品名|商品名稱)$/u.test(name)?'HEADER':/test|測試|樣本/i.test(name)?'TEST':!name?'UNKNOWN':original==null&&weight==null&&effective==null&&!barcodeRaw?'SOURCE_GROUP':'PRODUCT';
  const discontinued=['true','1','停售','未販售','是'].includes(text(1).toLowerCase());
  rows.push({sourceRowNumber:row,rawValues:raw,rawFormulas:raw.filter(c=>c.formula).map(c=>({column:c.column,formula:c.formula,cachedValue:c.cachedValue})),rowHash:sha(canonical(raw)),rowKind:kind,sourceGroup:kind==='SOURCE_GROUP'?name:null,normalizedName:name?normalizeCatalog(name):null,barcodeCandidate:barcode||null,weightCandidate:weight,originalPriceJpyCandidate:original,effectiveCostJpyCandidate:effective,warnings,candidate:{name,barcode,barcodeStatus,weightGrams:weight,originalPriceJpy:original,effectiveCostJpy:effective,status:discontinued?'DISCONTINUED':'NORMAL',preferredRouteLabel:text(7)||null,shippingReference:text(13)||null,shopeePriceTwd:decimal(18),sourcePrices:{W:value(23),X:value(24),AC:value(29),AL:value(38)}}});
 }return rows;
}
