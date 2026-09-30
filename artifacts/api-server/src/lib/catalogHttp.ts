import type {Router} from 'express';
import * as generated from '@workspace/api-zod';
import {CatalogError} from '@workspace/db/catalog';
import {requireAuth,verifyStoreOwner} from '../middlewares/auth.ts';
import {catalogExecute} from './catalogService.ts';
export function registerCatalog(router:Router,method:'get'|'post'|'patch'|'delete',path:string,operation:string){
 router[method](path,requireAuth,async(req:any,res)=>{
  const prefix=operation[0].toUpperCase()+operation.slice(1),schemas=generated as Record<string,any>;
  const params=schemas[prefix+'PathParams'].safeParse(req.params);
  if(!params.success)return res.status(400).json({error:'路徑 ID 必須是標準正整數'});
  const querySchema=schemas[prefix+'QueryParams'];const query=querySchema?querySchema.safeParse(req.query):{success:Object.keys(req.query).length===0,data:{}};
  if(!query.success)return res.status(400).json({error:'查詢參數格式錯誤'});
  const bodySchema=schemas[prefix+'Body'];const body=bodySchema?bodySchema.safeParse(req.body):{success:req.body===undefined||(req.body!==null&&typeof req.body==='object'&&!Array.isArray(req.body)&&Object.keys(req.body).length===0),data:{}};
  if(!body.success)return res.status(400).json({error:'輸入欄位格式錯誤',details:body.error?.issues});
  if(!await verifyStoreOwner(req,res,params.data.storeId))return;
  try{return res.json(await catalogExecute(operation,params.data,body.data,query.data,req.userId));}
  catch(error){if(error instanceof CatalogError)return res.status(error.status).json({error:error.message,details:error.details});throw error;}
 });
}
