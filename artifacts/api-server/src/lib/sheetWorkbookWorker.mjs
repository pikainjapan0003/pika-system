import {parentPort,workerData} from 'node:worker_threads';
import {inflateRawSync} from 'node:zlib';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),ExcelJS=require('exceljs/dist/exceljs.min.js'),{SaxesParser}=createRequire(require.resolve('exceljs'))('saxes');
const LIMIT={file:2*1024*1024,entries:128,inflated:12*1024*1024,entry:4*1024*1024,sheets:8,rows:500,columns:64,cells:10000,text:4096,formula:2048};
function check(ok,message){if(!ok)throw Error(message);}
function crc32(b){let n=0xffffffff;for(const x of b){n^=x;for(let j=0;j<8;j++)n=(n>>>1)^((n&1)?0xedb88320:0);}return (n^0xffffffff)>>>0;}
export function boundedZip(input){
 const b=Buffer.from(input);check(b.length<=LIMIT.file&&b.length>=22,'檔案大小超限或不是 XLSX');
 let end=-1;for(let p=b.length-22;p>=Math.max(0,b.length-65557);p--)if(b.readUInt32LE(p)===0x06054b50){end=p;break;}
 check(end>=0,'ZIP 結尾無效');check(b.readUInt16LE(end+4)===0&&b.readUInt16LE(end+6)===0,'不支援分卷 ZIP');
 const count=b.readUInt16LE(end+10),size=b.readUInt32LE(end+12),start=b.readUInt32LE(end+16);
 check(count<=LIMIT.entries&&count!==65535&&start!==0xffffffff&&size!==0xffffffff,'ZIP entry 數超限或 ZIP64 不支援');
 check(start+size===end&&end+22+b.readUInt16LE(end+20)===b.length,'ZIP 範圍無效');
 const files=new Map();let p=start,total=0;
 for(let i=0;i<count;i++){
  check(p+46<=end&&b.readUInt32LE(p)===0x02014b50,'ZIP entry 無效');
  const flags=b.readUInt16LE(p+8),method=b.readUInt16LE(p+10),crc=b.readUInt32LE(p+16),compressed=b.readUInt32LE(p+20),inflated=b.readUInt32LE(p+24),nl=b.readUInt16LE(p+28),el=b.readUInt16LE(p+30),cl=b.readUInt16LE(p+32),offset=b.readUInt32LE(p+42);
  check(!(flags&1)&&[0,8].includes(method)&&inflated!==0xffffffff&&compressed!==0xffffffff&&offset!==0xffffffff,'不支援加密／ZIP64／壓縮方式');
  check(p+46+nl+el+cl<=end,'ZIP entry 長度無效');const name=b.subarray(p+46,p+46+nl).toString('utf8');
  check(name.length<=200&&!name.includes('\\')&&!name.startsWith('/')&&!name.split('/').includes('..')&&!files.has(name),'ZIP 路徑無效或重複');
  check(inflated<=LIMIT.entry&&total+inflated<=LIMIT.inflated,'實際解壓大小超限');
  check(offset+30<=start&&b.readUInt32LE(offset)===0x04034b50,'ZIP local header 無效');
  const localName=b.readUInt16LE(offset+26),localExtra=b.readUInt16LE(offset+28),data=offset+30+localName+localExtra;
  check(data+compressed<=start&&b.subarray(offset+30,offset+30+localName).toString('utf8')===name&&b.readUInt16LE(offset+8)===method,'ZIP local 範圍不符');
  const raw=b.subarray(data,data+compressed),out=method===0?raw:inflateRawSync(raw,{maxOutputLength:Math.min(LIMIT.entry,LIMIT.inflated-total)+1});
  total+=out.length;check(out.length===inflated&&total<=LIMIT.inflated&&out.length<=LIMIT.entry&&crc32(out)===crc,'解壓大小／CRC 不符或超限');
  files.set(name,out);p+=46+nl+el+cl;
 }
 check(p===end,'ZIP directory 不符');return files;
}
function xml(bytes){
 check(bytes,'缺少 XLSX XML');const text=bytes.toString('utf8');check(!/<!DOCTYPE|<!ENTITY/i.test(text),'禁止 XML 外部實體');
 const parser=new SaxesParser(),stack=[],root={name:'root',attrs:{},children:[],text:''};stack.push(root);let nodes=0;
 parser.on('opentag',tag=>{check(++nodes<=50000&&stack.length<40,'XML 節點／深度超限');const n={name:tag.name.split(':').at(-1),attrs:tag.attributes,children:[],text:''};stack.at(-1).children.push(n);stack.push(n);});
 parser.on('text',t=>{const n=stack.at(-1);n.text+=t;check(n.text.length<=LIMIT.text,'XML 文字超限');});
 parser.on('cdata',t=>{const n=stack.at(-1);n.text+=t;check(n.text.length<=LIMIT.text,'XML 文字超限');});parser.on('closetag',()=>stack.pop());parser.on('error',e=>{throw e;});parser.write(text).close();return root;
}
const descendants=(n,name)=>n.children.flatMap(c=>[...(c.name===name?[c]:[]),...descendants(c,name)]);
const first=(n,name)=>n.children.find(c=>c.name===name),string=n=>n?(n.name==='t'?n.text:n.children.map(string).join('')):'';
export async function parseWorkbookBuffer(buffer,sheetTitle){
 const files=boundedZip(buffer),workbook=xml(files.get('xl/workbook.xml')),rels=xml(files.get('xl/_rels/workbook.xml.rels'));
 const sheets=descendants(workbook,'sheet');check(sheets.length>0&&sheets.length<=LIMIT.sheets,'分頁數超限');const names=sheets.map(s=>s.attrs.name);check(new Set(names).size===names.length,'分頁名稱重複');
 const strings=files.has('xl/sharedStrings.xml')?descendants(xml(files.get('xl/sharedStrings.xml')),'si').map(string):[];check(strings.length<=LIMIT.cells,'shared strings 超限');for(const s of strings)check(s.length<=LIMIT.text,'shared string 超限');
 let cellCount=0;const parsed=new Map();
 for(const sheet of sheets){
  const rel=descendants(rels,'Relationship').find(x=>x.attrs.Id===sheet.attrs['r:id']);check(rel&&rel.attrs.TargetMode!=='External','工作表關聯無效');
  const target=rel.attrs.Target.startsWith('/')?rel.attrs.Target.slice(1):'xl/'+rel.attrs.Target;check(!target.includes('..'),'工作表路徑不支援');
  const tree=xml(files.get(target)),cells=[];let maxRow=0;const addresses=new Set();
  for(const row of descendants(tree,'row')){const rn=Number(row.attrs.r);check(Number.isInteger(rn)&&rn>0&&rn<=LIMIT.rows,'列數超限');maxRow=Math.max(maxRow,rn);}
  for(const c of descendants(tree,'c')){
   check(++cellCount<=LIMIT.cells,'儲存格數超限');const address=c.attrs.r,m=/^([A-Z]+)([1-9]\d*)$/.exec(address??'');check(m,'儲存格位址無效');const col=[...m[1]].reduce((v,x)=>v*26+x.charCodeAt(0)-64,0),row=Number(m[2]);check(col<=LIMIT.columns&&row<=LIMIT.rows&&!addresses.has(address),'儲存格界限或重複');addresses.add(address);maxRow=Math.max(maxRow,row);
   const f=first(c,'f'),v=first(c,'v'),type=c.attrs.t??'n';check(!f||f.text.length<=LIMIT.formula,'公式長度超限');
   let value=v?.text??null;if(type==='s'){check(value!==null&&/^\d+$/.test(value)&&Number(value)<strings.length,'shared string 索引無效');value=strings[Number(value)];}if(type==='inlineStr')value=string(first(c,'is'));
   cells.push({row,column:col,type,value,formula:f?.text??null,cachedValue:f?value:null,numericLexeme:type==='n'?v?.text??null:null,style:c.attrs.s??null});
  }
  parsed.set(sheet.attrs.name,{cells,maxRow});
 }
 // Bounds and exact numeric XML lexemes are captured BEFORE the whole-workbook parser.
 const validated=new ExcelJS.Workbook();await validated.xlsx.load(Buffer.from(buffer));check(validated.worksheets.length===sheets.length,'XLSX 分頁不一致');
 if(!sheetTitle)return {sheetTitles:names,limits:LIMIT};
 check(parsed.has(sheetTitle),'請選擇檔案內的一個分頁');return {sheetTitles:names,...parsed.get(sheetTitle),limits:LIMIT};
}
if(parentPort)parseWorkbookBuffer(workerData.buffer,workerData.sheetTitle).then(result=>parentPort.postMessage({result}),error=>parentPort.postMessage({error:String(error.message??error)}));
