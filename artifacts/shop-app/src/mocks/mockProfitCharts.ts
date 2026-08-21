/**
 * ⛔ 假資料唯一存放點：artifacts/shop-app/src/mocks/
 *    唯一取用點：components/PreviewChart.tsx
 *    由 ci.yml 的 V1_MOCK_IMPORT_GUARD 機械閘門強制（mocks/ 被其他檔案 import → CI 失敗）。
 *    值刻意「一眼假」：整數化、刻意極端，禁止使用任何真實行程數字。
 */

/** E 路線單件成本排行（示意》；明顯非真實營運值） */
export const MOCK_ROUTE_COST_RANKING = [
  { name: "路線 甲", 單件成本: 999 },
  { name: "路線 乙", 單件成本: 876 },
  { name: "路線 丙", 單件成本: 754 },
  { name: "路線 丁", 單件成本: 612 },
  { name: "路線 戊", 單件成本: 480 },
  { name: "路線 己", 單件成本: 333 },
];

/** F 地區商品表現散點（件數 × 單件毛利 × 銷售額尺寸） */
export const MOCK_AREA_SCATTER = [
  { area: "北區", 件數: 320, 單件毛利: 88, 銷售額: 96000 },
  { area: "中區", 件數: 210, 單件毛利: 64, 銷售額: 54000 },
  { area: "南區", 件數: 150, 單件毛利: 120, 銷售額: 72000 },
  { area: "東區", 件數: 90, 單件毛利: 45, 銷售額: 18000 },
  { area: "離島", 件數: 40, 單件毛利: 199, 銷售額: 20000 },
];

/** G 敏感度熱圖：件數(列) × 單件毛利(欄) → 最終利益強度階（1–7，sequential）。 */
export const MOCK_SENSITIVITY_HEATMAP = {
  rows: ["90 件", "120 件", "150 件", "180 件", "210 件"],
  columns: ["40 元", "60 元", "80 元", "100 元", "120 元"],
  /** cells[row][col] ∈ 0..6（0＝無資料／待確認；1..7＝sequential 階） */
  cells: [
    [1, 2, 2, 3, 3],
    [2, 3, 4, 4, 5],
    [3, 4, 5, 6, 6],
    [4, 5, 6, 7, 7],
    [5, 6, 7, 7, 7],
  ] as number[][],
  domain: [
    "NT$ 0",
    "NT$ 20,000",
    "NT$ 40,000",
    "NT$ 60,000",
    "NT$ 80,000",
    "NT$ 100,000",
    "NT$ 120,000",
  ],
};

/** H 歷史趨勢（分月，示意）；整數極端，明顯非真實。 */
export const MOCK_HISTORY_TREND = [
  { month: "1月", profit: 30000 },
  { month: "2月", profit: 28000 },
  { month: "3月", profit: 34000 },
  { month: "4月", profit: 31000 },
  { month: "5月", profit: 38000 },
  { month: "6月", profit: 26000 },
  { month: "7月", profit: 42000 },
  { month: "8月", profit: 39000 },
  { month: "9月", profit: 45000 },
  { month: "10月", profit: 41000 },
  { month: "11月", profit: 47000 },
  { month: "12月", profit: 52000 },
];
