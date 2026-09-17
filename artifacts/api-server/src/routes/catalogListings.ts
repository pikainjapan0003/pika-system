import { Router } from "express";
import { CatalogError } from "@workspace/db/catalog";
import { requireAuth, verifyStoreOwner } from "../middlewares/auth.ts";
import { catalogListing, listingHistory } from "../lib/catalogListing.ts";
import { PricingResolutionError } from "../lib/pricingResolution.ts";
const router=Router();
const canonical=(value:string)=>/^[1-9][0-9]*$/.test(value)&&Number.isSafeInteger(Number(value))&&Number(value)<=2147483647;
function register(method:"get"|"post",path:string,kind:"create"|"recalculate"|"history"){
 router[method](path,requireAuth,async(req:any,res)=>{
  if(!Object.values(req.params).every(v=>typeof v==="string"&&canonical(v)))return res.status(400).json({error:"路徑 ID 必須是標準正整數"});
  if(Object.keys(req.query).length)return res.status(400).json({error:"不接受額外查詢參數"});
  const storeId=Number(req.params.storeId);
  if(!await verifyStoreOwner(req,res,storeId))return;
  try{
   const result=kind==="history"?await listingHistory(storeId,Number(req.params.productId),req.userId):await catalogListing(storeId,kind==="create"?Number(req.params.catalogProductId):null,kind==="recalculate"?Number(req.params.productId):null,req.body,req.userId);
   return res.status(kind==="create"&&req.body?.mode==="SAVE"?201:200).json(result);
  }catch(error){
   if(error instanceof CatalogError)return res.status(error.status).json({error:error.message,details:error.details});
   if(error instanceof PricingResolutionError)return res.status(error.status).json({error:error.message});
   if(error instanceof Error && error.name==="ZodError")return res.status(400).json({error:"上架欄位格式錯誤",details:(error as any).issues});
   if(error instanceof TypeError||error instanceof RangeError)return res.status(400).json({error:error.message});
   throw error;
  }
 });
}
register("post","/stores/:storeId/catalog-products/:catalogProductId/create-listing","create");
register("post","/stores/:storeId/products/:productId/recalculate-pricing","recalculate");
register("get","/stores/:storeId/products/:productId/pricing-history","history");
export default router;
