import {Router} from 'express';
import multer from 'multer';
import * as generated from '@workspace/api-zod';
import {CatalogError} from '@workspace/db/catalog';
import {requireAuth,verifyStoreOwner} from '../middlewares/auth.ts';
import {listingPreview,applyListingMatches,previewSheet,sheetAction,sheetReferences} from '../lib/reviewedImports.ts';
const router=Router(),schemas=generated as Record<string,any>;
const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:2097152,files:1,fields:4,parts:5,fieldSize:4096},fileFilter:(_req,file,callback)=>{if(!/\.xlsx$/i.test(file.originalname))return callback(new CatalogError(400,'只接受 XLSX 檔案'));callback(null,true);}}).single('file');
const endpoints:[string,'get'|'post',string,string][]=[
 ['/stores/:storeId/listing-matches/preview','get','CatalogListingMatchPreview','listingPreview'],
 ['/stores/:storeId/listing-matches/apply','post','CatalogListingMatchApply','listingApply'],
 ['/stores/:storeId/sheet-imports/preview','post','CatalogImportPreview','preview'],
 ['/stores/:storeId/sheet-imports/:batchId','get','CatalogImportGet','get'],
 ...(['resolve','approve','commit','rollback'] as const).map(a=>[`/stores/:storeId/sheet-imports/:batchId/${a}`,'post','CatalogImport'+a[0].toUpperCase()+a.slice(1),a] as [string,'post',string,string]),
 ['/stores/:storeId/catalog-products/:catalogProductId/sheet-references','get','CatalogImportReferences','references'],
];
for(const [path,method,prefix,action]of endpoints)router[method](path,requireAuth,async(req:any,res)=>{
 const params=schemas[prefix+'PathParams'].safeParse(req.params);if(!params.success)return res.status(400).json({error:'路徑 ID 格式錯誤'});
 if(!await verifyStoreOwner(req,res,params.data.storeId))return;
 try{
  if(action==='preview'&&req.is('multipart/form-data'))await new Promise<void>((resolve,reject)=>upload(req,res,e=>e?reject(e):resolve()));
  const query=schemas[prefix+'QueryParams']?.safeParse(req.query)??{success:Object.keys(req.query).length===0,data:{}};
  const body=schemas[prefix+'Body']?.safeParse(req.body)??{success:req.body===undefined||Object.keys(req.body).length===0,data:{}};
  if(!query.success||!body.success)return res.status(400).json({error:'欄位格式或界限錯誤',details:body.error?.issues??query.error?.issues});
  const {storeId:s,batchId:id,catalogProductId}=params.data,actor=req.userId;
  if(action==='preview'&&(req.file?(body.data.sourceType!=='XLSX_UPLOAD'||body.data.cells!==undefined):body.data.sourceType!=='STRUCTURED_CELLS'))throw new CatalogError(400,'sourceType 與實際來源不符');
  const result=action==='listingPreview'?await listingPreview(s,actor,query.data.page??1):action==='listingApply'?await applyListingMatches(s,actor,body.data):action==='preview'?await previewSheet(s,actor,body.data,req.file?.buffer):action==='references'?await sheetReferences(s,catalogProductId,actor):await sheetAction(s,id,actor,action,body.data);
  return res.json(result);
 }catch(e){if(e instanceof CatalogError)return res.status(e.status).json({error:e.message,details:e.details});if(e instanceof multer.MulterError)return res.status(400).json({error:'上傳檔案／欄位超限：'+e.code});throw e;}
});
export default router;
