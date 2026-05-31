import { useLocation } from "wouter";

const STEPS = [
  {
    step: "1",
    title: "建立商品",
    desc: "前往「商品管理」新增商品，設定名稱、價格、庫存與規格。",
    icon: "📦",
  },
  {
    step: "2",
    title: "分享下單連結",
    desc: "每個商品都有專屬連結。點選「複製分享連結」，傳給買家即可開始接單。",
    icon: "🔗",
  },
  {
    step: "3",
    title: "買家下單",
    desc: "買家開啟連結、填寫資料後下單。每筆訂單都會產生追蹤碼。",
    icon: "🛒",
  },
  {
    step: "4",
    title: "管理訂單",
    desc: "前往「訂單管理」確認並更新訂單狀態：待確認 → 待付款 → 備貨中 → 已出貨 → 已完成。",
    icon: "📋",
  },
  {
    step: "5",
    title: "買家追蹤訂單",
    desc: "買家可輸入追蹤碼至查詢頁，即時查看訂單目前狀態。",
    icon: "🔍",
  },
];

const TIPS = [
  "設定商品庫存可防止超賣，留空代表不限量。",
  "可透過「匯出 CSV」將訂單下載至 Excel 整理。",
  "商品可個別開關，關閉後買家無法下單但歷史訂單保留。",
  "追蹤碼讓買家自助查詢，減少詢問狀態的訊息。",
];

export default function GuidePage() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-[100dvh] bg-background max-w-[480px] mx-auto pb-10">
      <header className="bg-white border-b border-border px-5 pt-10 pb-4 sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setLocation("/dashboard")}
            className="text-sm text-muted-foreground"
          >
            ←
          </button>
          <h1 className="text-lg font-bold text-foreground">使用說明</h1>
        </div>
      </header>

      <div className="px-5 py-5 space-y-5">
        {/* Steps */}
        <div className="bg-white rounded-2xl border border-border overflow-hidden">
          <div className="px-5 py-4 border-b border-border">
            <h2 className="text-sm font-semibold text-foreground">快速上手</h2>
          </div>
          <div className="divide-y divide-border">
            {STEPS.map((s) => (
              <div key={s.step} className="px-5 py-4 flex gap-4">
                <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-bold text-primary">
                  {s.step}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-base">{s.icon}</span>
                    <span className="font-semibold text-foreground text-sm">{s.title}</span>
                  </div>
                  <p className="text-muted-foreground text-sm mt-1 leading-relaxed">{s.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Tips */}
        <div className="bg-white rounded-2xl border border-border overflow-hidden">
          <div className="px-5 py-4 border-b border-border">
            <h2 className="text-sm font-semibold text-foreground">使用技巧</h2>
          </div>
          <div className="px-5 py-4 space-y-3">
            {TIPS.map((tip, i) => (
              <div key={i} className="flex gap-3 text-sm">
                <span className="text-primary font-bold flex-shrink-0">·</span>
                <span className="text-foreground leading-relaxed">{tip}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Buyer flow */}
        <div className="bg-primary/5 rounded-2xl border border-primary/20 px-5 py-4">
          <h2 className="text-sm font-semibold text-foreground mb-2">買家體驗</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            買家點擊分享連結 → 填寫下單資訊 → 收到追蹤碼 → 可隨時至 <span className="font-mono text-xs bg-white px-1 py-0.5 rounded">/track</span> 查詢訂單狀態。
          </p>
        </div>
      </div>
    </div>
  );
}
