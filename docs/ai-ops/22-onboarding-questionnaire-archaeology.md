# 首登問卷考古與最小實作盤點

- 盤點日：2026-07-18（Asia/Taipei）
- 範圍：git 歷史、BATCH-8 報告、T-30 技能地圖規格、現行套餐 API 與前端接線。
- 本包只出報告，不修改問卷或產品程式。

## 結論

首登問卷**不是做過後被刪除**，而是 BATCH-8 包6在 2026-07-17 依批次紀律主動 skipped。當時已知四題與六個套餐，但缺少「答案如何計分、答案衝突怎麼解、平手選哪個」的拍板規則；Codex 沒有自行發明推薦演算法。README 隨後同步為「首登推薦問卷尚未開放」（`README.md:16`），這是正確的現況標示。

現行後端已具備套餐 preview/apply，不需要新增資料表或後端欄位；但**推薦語意仍是未拍板產品決策**。因此 BATCH-11 包7的前置條件「可做且不需新後端」只滿足技術半邊，未滿足「不得猜推薦規則」的產品半邊，本輪應 skipped。

## 歷史證據

| 證據                                                                         | 結論                                                    |
| ---------------------------------------------------------------------------- | ------------------------------------------------------- |
| `C:\Users\Lnovo\Documents\Codex\2026-07-17\outputs\BATCH8-report.md` 包6     | 明記 `skipped`；原因是沒有答案計分、衝突與平手優先序    |
| `C:\Users\Lnovo\Documents\Codex\2026-07-17\outputs\T-102-inventory-check.md` | 再次列為「已拍板但尚未完成」，缺少推薦決策表            |
| commit `60f2514 update-readme-and-manual-v2`                                 | 只同步「問卷尚未開放」，沒有問卷產品碼                  |
| `git log -S"onboarding"`                                                     | 現行前後端沒有被加入後又移除的問卷實作紀錄              |
| `git log -S"尚未開放" -- README.md`                                          | 「尚未開放」由現況同步 commit 加入，不是功能刪除 commit |

## 現行可複用能力

### 套餐事實來源

`lib/db/src/skills/skillState.ts:20-63` 定義六個正式 key：

- `beginner`
- `cost`
- `group-buy`
- `wholesale`
- `shipping`
- `automation`

套餐只會增加建議技能，不會關掉既有技能。高風險技能不會被套餐 apply 偷開，而會留在 `requiresConfirmation`；缺前置的技能會留在 `missingPrerequisite`（`skillState.ts:135-171`）。

### 後端 API 已存在

- `POST /stores/:storeId/skill-packages/:packageKey/preview`：驗 owner、載入 facts 與目前 enabled skills，再回 diff（`routes/skills.ts:270-296`）。
- `POST /stores/:storeId/skill-packages/:packageKey/apply`：驗 owner、重驗 catalog version 與 prerequisites，只寫 `enableNow`，並留匿名 audit（`routes/skills.ts:298-363`）。

### 前端參考流程已存在

技能地圖現有 `previewPackage()`／`applyPackage()`，會先 preview、顯示差異，再帶 `catalogVersion` apply；成功後同步刷新技能地圖與全站 visibility（`SkillMap.tsx:149-187`）。問卷不應另寫一套 API 或直接操作 skill state。

## T-30 已定義、但尚不足以產生推薦的部分

T-30 §5 已列四題：

1. 主要工作：一般代購／日本現場採購／團購／批發／大量出貨。
2. 成本需求：只看售價／商品成本／含出國交通分攤。
3. 每週單量：1–10／11–50／50+。
4. 物流與提醒：手動即可／出貨工具／只讀提醒。

它也已拍板：

- 可全部跳過。
- 結果頁先顯示推薦套餐與會開啟的技能。
- 使用者按套用才寫入。
- 跳過推薦新手套餐，不在背景偷開高風險技能。

但下列決策仍空白：

1. 同一答案可替哪些套餐加幾分。
2. 「日本現場採購＋大量出貨」這類跨流派組合選單一套餐還是多套餐。
3. 每週單量只說「影響推薦」，沒有影響方式。
4. 成本、物流、自動化同分時的優先序。
5. 是否永遠先套 beginner，再疊加推薦套餐；還是只套推薦套餐。
6. 高風險技能都不能由 package 自動開時，問卷結果頁如何解釋「推薦」與「已套用」的差異。

## 不新增後端的最小實作路徑

拍板推薦表後，可用一個純前端小包完成：

1. 新增純函式常數：題目、答案、每答案對套餐的分數，以及固定平手優先序。
2. 純函式 `recommendSkillPackage(answers)`：只回正式 `SkillPackageKey`，不直接寫資料。
3. Dashboard 在 `skillVisibility.loaded && enabledSkillCount === 0` 時顯示 3–5 題問卷；有任一 enabled skill 後不再顯示。
4. 結果頁呼叫既有 package preview API，明列 `enableNow`、`requiresConfirmation` 與 `missingPrerequisite`。
5. 使用者按「套用」才呼叫既有 apply API；跳過則 preview/apply `beginner`。
6. apply 成功後沿用 `refreshSkillStateViews()`，立即刷新全站入口。
7. 不新增 onboarding profile：本最小版以「零技能」作首次條件；套用或跳過後都會產生 beginner skill state，因此不會再次顯示。

## 必要測試

- 至少三組先拍板的答案 → 套餐 key 固定輸出。
- 全部跳過 → `beginner`。
- 平手案例 → 固定優先序，不依物件鍵順序。
- preview 顯示的高風險技能不會被 apply 自動啟用。
- apply 成功後 visibility refresh，問卷卡消失。

## 待拍板的最小答題卡

### 題 1：是否採單一套餐推薦？

- A（建議）：只推薦一個主套餐；畫面另列次推薦，不自動套。
- B：允許一次推薦並套用多套餐。

影響：B 可能一次產生更多高風險「待逐項確認」，新手理解成本較高。

### 題 2：是否永遠先套新手套餐？

- A（建議）：是；新手套餐是所有店的操作地基，再疊一個主套餐。
- B：否；只套問卷推薦套餐。

### 題 3：平手優先序

- 建議保守順序：`beginner → cost → shipping → group-buy → wholesale → automation`。
- 原因：先完成核心與只讀／內部工具，最後才推薦外部、自動化或高度前置依賴。

### 題 4：每個答案的計分表

需要老闆逐列確認；未確認前不可從題目文案反推。最少要定義「主要工作」「成本需求」「單量」「物流需求」四題各選項對六套餐的 0/1/2 分。

## BATCH-11 包7裁決

**skipped。**技術接線可在不新增後端的前提下完成，但推薦計分、衝突與平手規則仍是未拍板產品語意。依本批「撞未拍板題跳過不猜」與「包定義不可替換」，本輪不以硬編映射或其他功能冒充問卷實作。
