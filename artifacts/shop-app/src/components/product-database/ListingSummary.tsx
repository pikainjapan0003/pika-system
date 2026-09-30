import { Link } from "wouter";
import { getListingPricingHistory, listProducts } from "@workspace/api-client-react";
import { useCatalogQuery, Money, Failure, action } from "./shared";
export function ListingSummary({s,id}:{s:number;id:number}){
 const q=useCatalogQuery(s,["listing-history",id],signal=>getListingPricingHistory(s,id,{signal}));
 if(q.isError)return <Failure error={q.error} retry={()=>void q.refetch()}/>;
 return <div className="mt-2 space-y-1 text-sm" onClick={e=>e.stopPropagation()}>
  {q.data?.costUpdated&&<p className="font-semibold text-foreground">成本資料已更新</p>}
  <p>原本估算淨利：<Money currency="TWD" value={q.data?.current?.generalNetProfitTwd}/></p>
  <Link className={action+" inline-flex items-center underline"} href={`/products/${id}/edit`}>查看差異／手動套用新價格</Link>
 </div>;
}
export function CatalogListings({s,catalogId}:{s:number;catalogId:number}){
 const q=useCatalogQuery(s,["linked-listings",catalogId],signal=>listProducts(s,{signal}));
 return <div className="space-y-3"><Link className={action+" inline-flex items-center underline"} href={`/products/new?catalogId=${catalogId}`}>建立上架商品</Link>
  {q.isError?<Failure error={q.error} retry={()=>void q.refetch()}/>:q.isPending?<p>載入上架紀錄…</p>:q.data?.filter(p=>p.catalogProductId===catalogId).length?q.data.filter(p=>p.catalogProductId===catalogId).map(p=><article key={p.id} className="border-t border-border pt-3"><Link className={action+" inline-flex items-center underline"} href={`/products/${p.id}/edit`}>{p.name} · {p.isActive?"開放下單":"已下架"}</Link><ListingSummary s={s} id={p.id}/></article>):<p>尚無連結上架商品。</p>}
 </div>;
}
