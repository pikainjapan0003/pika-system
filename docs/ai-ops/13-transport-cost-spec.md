# 13 交通成本分攤模組 實作規格（已定案，可開工）

> 依據：`10-cost-sheet-mapping.md` §2.1（公式原文）＋`12-owner-decisions.md` Q1/Q5/Q8 老闆答覆（2026-07-07）。
> 讀者：實作用的任何模型。**照本檔做即可，不要回頭重新解讀 Sheet**；本檔與 Sheet 衝突時，先停，回報差異（03 檔 §10.4）。
> 範圍：只做「交通成本分攤」。營收/毛利/優惠等屬另一條線（凍結），不做。

## 1. 資料模型（建議，實作時可依 repo 慣例調整命名，不可調整語意）

**trip（一趟行程）**
- `name`（例：北海道 2026-06）、`exchange_rate`（**每趟一個**，decimal，老闆手填；Q1 定案）、備註。

**trip_route（行程內一條路線/地區，對應 Sheet 一列）**
- 手填欄（全部日圓、decimal、可為 0）：`area_title`（分攤查找鍵，需唯一）、`start_place`、`end_place`、`train_jpy`、`fuel_jpy`（油價手查 gogo.gs 後手填，見 11 檔）、`parking_jpy`、`est_qty`（整數 >0）、`cardboard_jpy`、`shipping_jpy`、`parcel_count`。
- `etc_jpy`：預設公式 `30 × est_qty`（沿用 Sheet R3C4 `=30*H3`，30 為 Sheet 既有常數），**必須可人工覆寫**（例外常態原則）。
- 每個計算欄也都要保留人工覆寫欄位＋覆寫標記。

## 2. 計算公式（單一真相，來源＝Sheet 公式原文＋Q8 定案）

全部用 decimal（禁止 float 累加；Q5 定案），中間值不進位：

```text
fee_1_5pct          = (cardboard_jpy + shipping_jpy) × 0.015                     ← Sheet R3C11
total_jpy           = etc_jpy + train_jpy + fuel_jpy + parking_jpy
                      + cardboard_jpy + shipping_jpy + fee_1_5pct                ← Sheet R3C14
domestic_per_item   = (cardboard_jpy + shipping_jpy) ÷ est_qty                   ← Sheet R3C15
transport_per_item  = (etc_jpy + train_jpy + fuel_jpy + parking_jpy
                      + fee_1_5pct) ÷ est_qty                                    ← Sheet R3C16
final_cost_per_item = (domestic_per_item + transport_per_item) × exchange_rate  ← Sheet R3C17；Q8 定案：單位=台幣，一定乘匯率
```

注意：`fee_1_5pct` 只對紙板＋境內運費抽 1.5%（照 Sheet 原文），不對 ETC/油/停車抽。SHADOW 分頁「不乘匯率」的算法**不採用**（Q8）。

## 3. 進位規則（Q5 定案）

- 系統內部與 DB：保留小數（decimal），不進位。
- 顯示給人看／寫進客人看得到的金額：**四捨五入取整數台幣**，且只在最後顯示層做。
- 測試比對：與 fixture 差異容忍 0（decimal 精確比對至 fixture 小數位數）。

## 4. 錯誤處理（03 檔 §8.5）

- `est_qty` 為 0、空、負 → 擋下並提示，**不可默默算出 0 或 Infinity**（Sheet 同款防呆：`IF((H="")+(H=0),"")`）。
- `exchange_rate` 空 → 擋下提示，不可當 0（當 0 會算出成本 0＝最危險的靜默錯誤）。
- 其他日圓欄空 → 視為 0（Sheet 用 IFERROR(x,0) 同義）。

## 5. Test fixtures（Sheet 真實列，主對話已逐步手算驗證 2026-07-07）

**Fixture A：規劃成本暫存區第 3 列「新千歲空港」**（完整驗算）
輸入：etc=5400（=30×180）, train=0, fuel=8371, parking=5000, est_qty=180, cardboard=1360, shipping=6136, rate=0.199
預期：fee=112.44；total=26379.44；domestic=41.6444444…（7496÷180）；transport=104.908（18883.44÷180）；**final=29.16393644**（146.5524444…×0.199）
顯示層：final 顯示 29（四捨五入）。

**Fixture B：第 5 列「小樽」**
預期 final_cost_per_item=22.4166535；且「商品輸入條碼區」第 3 列（小樽商品）交通變異成本(單件)=22.4166535——跨表查找一致性的驗證點（詳見 10 檔 §4 Fixture 2）。

**Fixture C：邊界**——est_qty=0 → 擋下；exchange_rate 空 → 擋下；全部日圓欄=0、est_qty=1、rate=0.2 → final=0。

## 6. 與商品的銜接（第 2 步，本規格先定義不實作）

商品掛 `trip_route`（Sheet 上是用「地區」欄 VLOOKUP `規劃成本暫存區!A:Q` 第 17 欄），商品的「單件交通成本」＝該 route 的 `final_cost_per_item`。地區找不到時 Sheet 回空字串——系統版必須顯示警告，不可默默 0。

## 7. 實作驗收條件（照 03 檔 §2/§8）

1. 純函式模組（放 `lib/`），不依賴 route/UI。
2. `pnpm run typecheck` 通過；Fixture A/B/C 全部通過（node:test）。
3. 回報附 Fixture A 的逐步計算輸出與 Sheet 值比對表。
4. 高風險區規則適用：需 fresh-context 獨立驗證一筆樣本（02 檔 §6）。
5. DB schema 變更走 drizzle；不動生成物；commit 不 push（等老闆授權）。
