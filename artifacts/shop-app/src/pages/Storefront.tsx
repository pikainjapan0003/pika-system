import { Link } from "wouter";

// Public brand entrance. Synthetic engineering products are never queried here.
export default function Storefront() {
  return <main className="mx-auto flex min-h-[100dvh] max-w-3xl flex-col px-6 py-10">
    <header className="flex flex-wrap items-center justify-between gap-5 border-b border-border pb-6">
      <Link href="/" className="text-xl font-bold tracking-wide">PIKA JP Selects</Link>
      <nav aria-label="商店導覽" className="flex gap-5 text-sm">
        <Link href="/shop">商品</Link>
        <Link href="/cart">購物車</Link>
        <Link href="/track">查詢訂單</Link>
      </nav>
    </header>
    <section className="flex-1 py-20" aria-labelledby="shop-title">
      <p className="mb-4 text-sm tracking-widest text-muted-foreground">PIKA JP SELECTS</p>
      <h1 id="shop-title" className="text-3xl font-bold">商品準備中</h1>
      <p className="mt-5 leading-8 text-muted-foreground">精選商品上架後，將在這裡提供商品資訊。目前尚未開放下單。</p>
    </section>
    <footer className="flex items-center justify-between border-t border-border pt-5 text-sm text-muted-foreground">
      <span>PIKA JP Selects</span>
      <Link href="/sign-in">店主管理</Link>
    </footer>
  </main>;
}
