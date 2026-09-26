import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";

export default function PocShop() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["poc-catalog"],
    queryFn: async () => {
      const response = await fetch(`${import.meta.env.BASE_URL}api/poc/catalog`);
      if (!response.ok) throw new Error("無法載入測試商品");
      return response.json() as Promise<{ products: Array<{ name: string; price: string; shareToken: string }> }>;
    },
  });
  return <main className="mx-auto max-w-2xl space-y-6 px-6 py-10">
    <h1 className="text-2xl font-bold">合成資料測試店鋪</h1>
    <p>私人 POC：請只填假資料。不收款、不出貨、不寄通知。</p>
    <nav className="flex gap-5 underline"><Link href="/products">店主管理商品</Link><Link href="/cart">購物車</Link><Link href="/track">查詢假訂單</Link></nav>
    {isLoading && <p>載入商品中…</p>}
    {error && <p role="alert">無法載入測試商品，請稍後重新整理。</p>}
    {data?.products.map(product => <article key={product.shareToken} className="rounded-xl border p-5 space-y-2">
      <h2 className="font-semibold">{product.name}</h2><p>NT$ {product.price}</p>
      <Link className="text-primary underline" href={`/p/${product.shareToken}`}>查看商品與模擬下單</Link>
    </article>)}
    {data?.products.length === 0 && <p>尚無測試商品，請指定店主登入上架。</p>}
  </main>;
}
