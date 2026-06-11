/**
 * 物流同步狀態說明（Step 7G）：自動同步尚未啟用前的誠實揭露。
 * 純靜態說明，不打 API；待 Step 7F 補 worker / 排程 / 手動同步後改為動態狀態。
 */

export function LogisticsSyncStatusNotice() {
  return (
    <div className="bg-white rounded-2xl border border-border p-5 space-y-3">
      <h2 className="text-sm font-bold text-foreground">物流同步狀態</h2>
      <p className="text-xs text-muted-foreground leading-relaxed">
        目前自動同步尚未啟用。物流 Excel 匯入或手動填入物流單號後，系統會先保存物流單號與匯入結果，但不會自動向物流商查詢最新貨態。
      </p>
      <div className="grid grid-cols-2 gap-3 text-xs">
        <div>
          <div className="font-medium text-foreground mb-1">目前可用</div>
          <ul className="space-y-0.5 text-muted-foreground">
            <li>・物流 Excel 匯入</li>
            <li>・手動填入物流單號</li>
            <li>・查看匯入紀錄</li>
            <li>・查看物流異常</li>
          </ul>
        </div>
        <div>
          <div className="font-medium text-foreground mb-1">尚未啟用</div>
          <ul className="space-y-0.5 text-muted-foreground">
            <li>・自動定時查詢物流商貨態</li>
            <li>・整批手動同步</li>
            <li>・上次同步 / 下次同步顯示</li>
            <li>・同步紀錄列表</li>
          </ul>
        </div>
      </div>
      <button
        type="button"
        disabled
        className="w-full h-10 rounded-xl bg-secondary text-muted-foreground text-sm font-medium opacity-60 cursor-not-allowed"
      >
        手動同步尚未啟用
      </button>
      <p className="text-[11px] text-muted-foreground/80">
        後續 Step 7F 會補上物流同步 worker、排程與手動同步入口。
      </p>
    </div>
  );
}

/** 簡短版提醒：給物流異常頁等次要位置使用。 */
export function LogisticsSyncStatusHint() {
  return (
    <p className="text-[11px] text-muted-foreground bg-secondary rounded-xl px-3 py-2 leading-relaxed">
      目前自動同步尚未啟用，貨態不會自動更新；本頁僅顯示匯入與物流查詢失敗的資料。
    </p>
  );
}
