# 賣貨便物流方式修正完工報告

- 基準：`origin/main@57ceeb2c091a471959c92d6ecaa4789ab82956c2`
- 分支：`fix/maihuobian-shipping-method`
- 工作區：`C:\Users\Lnovo\Desktop\pika-maihuobian-fix`
- 原則：每包獨立 commit；本批未 push；未新增 migration；未連 production 或既有資料庫。

## 逐包結果

| 包  | 狀態 | commit                     | 內容與驗證                                                                                                                                 |
| --- | ---- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | done | `1274f3b`                  | 新增「7-11 賣貨便」費率 38；shipping 純測試 3/3、Prettier、shipping typecheck 通過。                                                       |
| 2   | done | `0f43367`                  | PublicOrder、PublicCart、CreateOrderDialog、EditOrderDialog 皆把賣貨便排在 7-11 群第一；元件測試 10/10、shop typecheck、Prettier 通過。    |
| 3   | done | `dbbc854`                  | 匯出資格改為精確比對賣貨便；四種物流案例與原既有案例測試 5/5、api-server typecheck 通過。                                                  |
| 4   | done | `047390f`                  | 運費驗證上限改用共用 38 元常數；0/38 通過、39/負數拒絕；DB 測試 11/11、shipping 測試 3/3、shop/db/api typecheck 與 Prettier 通過。         |
| 5   | done | `1f4c6a8`                  | 規格同步 M9/M10/M11、官方 38 元回報、精確資格條件與已解決題卡；Prettier 通過。                                                             |
| 6   | done | `c1bd086`                  | 新增 Pending spec，驗證賣貨便進可匯出區、60 元兩種 7-11 進不可匯出區且顯示精確理由；Prettier 通過，pending config `--list` 探索 10 tests。 |
| 7   | done | 本報告提交（見 `git log`） | 本報告、SHA-256 自校驗與工作樹清理。                                                                                                       |

## 測試與限制

- `lib/shipping/src/index.test.mjs`：3 passed / 0 failed。
- `lib/db/src/maihuobian/validateMaihuobianRow.test.mjs`：11 passed / 0 failed。
- `artifacts/api-server/src/lib/maihuobianExport.test.mjs`：5 passed / 0 failed。
- Package 2 component tests：10 passed / 0 failed。
- typecheck：shop-app、lib/db、api-server 均 exit 0。
- Pending config `--list`：10 tests in 10 files，包含新增 `maihuobian-eligibility.spec.mjs`。
- 新 Pending spec 尚未在本機瀏覽器實跑：Windows pnpm wrapper 觸發 `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`，未以此結果冒稱通過；待審查側的 CI／容器環境補跑。
- 所有改動檔已通過 Prettier；本批未改主 testMatch、未移除 pending 標記、未改後端 migration。

## 拍板落地

- M9：賣貨便固定 38 元，費率表與匯出列驗證共用同一常數。
- M10：賣貨便、7-11 取貨（先付款）、7-11 貨到付款三者並存，既有 60 元方式未改費率或行為。
- M11：四個下單／編輯頁的賣貨便選項排在 7-11 選項群第一個，沿用既有選店流程。
- 匯出只接受：訂單狀態 `preparing`、出貨狀態 `not_shipped`、物流方式精確等於「7-11 賣貨便」。

## Git 狀態

- 本批所有 coding 包均為獨立 commit。
- 本批未 push；原本 stale `main` 與 `backup/local-main-stale-20260803` 未觸碰。
- 完工時工作樹應為乾淨狀態；外部依賴備份目錄不納入 Git。

重算規則：讀取本檔 UTF-8 原始 bytes，刪除整行 `SELF_SHA256:`（含換行）後計算 SHA-256。

SELF_SHA256: e24976fbe61e46d95c44a5f81e213e519bbad7f5f3ea65525c2f4158bcf79847
