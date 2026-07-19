import { useLocation } from "wouter";

export default function HomePage() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-[100dvh] bg-background flex flex-col">
      <header className="px-6 pt-10 pb-6">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-sm">畫</span>
          </div>
          <span className="font-bold text-xl text-foreground">畫夢代購</span>
        </div>
      </header>

      <main className="flex-1 px-6 flex flex-col justify-center max-w-sm mx-auto w-full">
        <div className="mb-10">
          <h1 className="text-3xl font-bold text-foreground leading-snug mb-3">
            團購代購
            <br />
            輕鬆管理
          </h1>
          <p className="text-muted-foreground text-base leading-relaxed">
            建立商品頁面、分享連結給買家，訂單自動彙整。
            專為小型商家設計的訂單管理工具。
          </p>
        </div>

        <div className="space-y-3">
          <button
            onClick={() => setLocation("/sign-up")}
            className="w-full h-12 bg-primary text-white font-semibold rounded-xl text-base active:opacity-90 transition-opacity"
          >
            免費開始使用
          </button>
          <button
            onClick={() => setLocation("/sign-in")}
            className="w-full h-12 bg-secondary text-foreground font-semibold rounded-xl text-base active:opacity-90 transition-opacity"
          >
            已有帳號，登入
          </button>
        </div>

        <div className="mt-12 space-y-5">
          {[
            {
              icon: "🔗",
              label: "商品分享連結",
              desc: "每個商品都有專屬連結，買家不需註冊即可下單",
            },
            {
              icon: "📋",
              label: "訂單自動彙整",
              desc: "訂單狀態一目瞭然，支援 CSV 匯出",
            },
            {
              icon: "📱",
              label: "手機優化介面",
              desc: "隨時隨地管理訂單，行動優先設計",
            },
          ].map((f) => (
            <div key={f.label} className="flex gap-4 items-start">
              <div className="w-10 h-10 bg-accent/20 rounded-xl flex items-center justify-center flex-shrink-0 text-lg">
                {f.icon}
              </div>
              <div>
                <div className="font-semibold text-foreground text-sm">
                  {f.label}
                </div>
                <div className="text-muted-foreground text-sm mt-0.5">
                  {f.desc}
                </div>
              </div>
            </div>
          ))}
        </div>
      </main>

      <footer className="px-6 py-8 text-center text-xs text-muted-foreground">
        畫夢代購 DrawDream — 小型商家訂單管理
      </footer>
    </div>
  );
}
