import { Component, useEffect, useRef, useState, type ReactNode, type FocusEvent } from 'react';
import { Link } from 'wouter';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useGetMyStore } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { BottomNavigation } from '@/components/BottomNavigation';
import { catalogError, catalogMoney, statusLabels } from '@/lib/productDatabase';
import type { CatalogProduct } from '@workspace/api-client-react';

export const control = 'min-h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-base text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2';
export const panel = 'min-w-0 rounded-lg border border-border bg-card p-4 sm:p-5 lg:p-6';
export const action = 'min-h-11 min-w-11';
export function Money({value,currency='JPY'}:{value?:string|null;currency?:'JPY'|'TWD'}) {const m=catalogMoney(value,currency);return <span className="whitespace-nowrap tabular-nums" aria-label={m.spoken}>{m.text}</span>;}
export function Status({status}:{status:CatalogProduct['status']}){return <span className="inline-flex items-center gap-2 border border-border px-2 py-1 text-sm"><span aria-hidden="true">●</span>{statusLabels[status]}</span>;}
function revealCatalogFocus(event:FocusEvent<HTMLElement>,footer:HTMLDivElement|null){
 const target=event.target;if(!(target instanceof HTMLElement)||!event.currentTarget.contains(target))return;
 const rect=target.getBoundingClientRect(),viewport=window.visualViewport,top=(viewport?.offsetTop??0)+8;
 const bottom=Math.min((viewport?.offsetTop??0)+(viewport?.height??window.innerHeight),footer?.querySelector('nav')?.getBoundingClientRect().top??window.innerHeight)-8;
 if(bottom<=top)return;
 const delta=rect.height>bottom-top?rect.top-top:rect.bottom>bottom?rect.bottom-bottom:rect.top<top?rect.top-top:0;
 if(delta)window.scrollBy({top:delta,behavior:'instant'});
}
export function Shell({title,children,actions,back='/product-database'}:{title:string;children:ReactNode;actions?:ReactNode;back?:string}){
 const footer=useRef<HTMLDivElement>(null),pointerActive=useRef(false);
 useEffect(()=>{const release=()=>{pointerActive.current=false;};window.addEventListener('pointerup',release,true);window.addEventListener('pointercancel',release,true);window.addEventListener('blur',release);return()=>{window.removeEventListener('pointerup',release,true);window.removeEventListener('pointercancel',release,true);window.removeEventListener('blur',release);};},[]);
 // Moving a newly focused button between pointerdown and pointerup loses its click.
 // Keyboard/programmatic focus still uses the original viewport/footer protection.
 return <><main onPointerDownCapture={()=>{pointerActive.current=true;}} onKeyDownCapture={()=>{pointerActive.current=false;}} onFocusCapture={e=>{if(!pointerActive.current)revealCatalogFocus(e,footer.current);}} className="mx-auto min-h-dvh max-w-7xl px-4 pb-[calc(112px+env(safe-area-inset-bottom))] pt-6 sm:px-6 lg:px-8"><header className="mb-6 flex flex-wrap items-start justify-between gap-4"><div className="min-w-0"><Link href={back} className="inline-flex min-h-11 items-center text-sm text-secondary-foreground underline underline-offset-4">{back==='/products'?'返回上架商品':'返回商品資料庫'}</Link><h1 className="break-words text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1></div><div className="flex flex-wrap gap-2">{actions}</div></header>{children}</main><div ref={footer}><BottomNavigation active="products"/></div></>;
}
export function Loading(){return <div className={`${panel} space-y-4`} role="status" aria-label="載入中"><div className="h-6 w-2/3 animate-pulse bg-secondary motion-reduce:animate-none"/><div className="h-24 bg-secondary"/><p>正在載入商品資料…</p></div>;}
export function Failure({error,retry}:{error:unknown;retry:()=>void}){return <div className={panel} role="alert"><p className="mb-3">{catalogError(error)}</p><Button className={action} variant="outline" onClick={retry}>重試</Button></div>;}
export function Empty({children}:{children:ReactNode}){return <div className={`${panel} text-secondary-foreground`}>{children}</div>;}
export function StoreGate({children}:{children:(storeId:number)=>ReactNode}){const store=useGetMyStore();if(store.isError)return <Failure error={store.error} retry={()=>void store.refetch()}/>;if(!store.data)return <Loading/>;return <div key={store.data.id}>{children(store.data.id)}</div>;}
export function useCatalogQuery<T>(s:number,key:readonly unknown[],load:(signal:AbortSignal)=>Promise<T>,enabled=true){return useQuery({queryKey:['product-database',s,...key],queryFn:({signal})=>load(signal),enabled,retry:false});}
export function useRefreshCatalog(s:number){const qc=useQueryClient();return ()=>qc.invalidateQueries({queryKey:['product-database',s]});}
export function useDebounced<T>(value:T,ms=300){const [current,setCurrent]=useState(value);useEffect(()=>{const timer=setTimeout(()=>setCurrent(value),ms);return ()=>clearTimeout(timer);},[value,ms]);return current;}
export function Field({id,label,value,onChange,error,help,readOnly=false,type='text',inputMode,maxLength=2000}:{id:string;label:string;value:string;onChange?:(v:string)=>void;error?:string;help?:string;readOnly?:boolean;type?:string;inputMode?:'decimal'|'numeric';maxLength?:number}){return <div className="min-w-0 space-y-2"><label className="block text-sm font-medium" htmlFor={id}>{label}</label><Input id={id} value={value} onChange={e=>onChange?.(e.target.value)} readOnly={readOnly} type={type} inputMode={inputMode} maxLength={maxLength} className={control} aria-invalid={!!error} aria-describedby={error?`${id}-error`:help?`${id}-help`:undefined}/>{help?<p id={`${id}-help`} className="text-sm text-secondary-foreground">{help}</p>:null}{error?<p id={`${id}-error`} className="text-sm text-destructive">{error}</p>:null}</div>;}
export function ErrorSummary({errors,message}:{errors:Record<string,string>;message?:string}){const ref=useRef<HTMLDivElement>(null);useEffect(()=>{if(message||Object.keys(errors).length)ref.current?.focus();},[errors,message]);if(!message&&!Object.keys(errors).length)return null;return <div ref={ref} tabIndex={-1} role="alert" className="rounded-md border border-destructive p-4 focus-visible:ring-2 focus-visible:ring-ring"><h2 className="font-semibold">請確認以下內容</h2>{message?<p>{message}</p>:null}<ul>{Object.entries(errors).map(([id,text])=><li key={id}><a className="inline-flex min-h-11 items-center underline" href={`#${id}`} onClick={e=>{const target=document.getElementById(id);if(target){e.preventDefault();target.focus();}}}>{text}</a></li>)}</ul></div>;}
export class CatalogBoundary extends Component<{children:ReactNode},{failed:boolean}>{state={failed:false};static getDerivedStateFromError(){return {failed:true};}render(){return this.state.failed?<Shell title="畫面暫時無法載入"><Empty><p>請重新載入後再試，已儲存資料不受影響。</p><Button className={action} onClick={()=>window.location.reload()}>重新載入</Button></Empty></Shell>:this.props.children;}}
