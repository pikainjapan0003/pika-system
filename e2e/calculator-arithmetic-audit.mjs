import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { calculate } from "../artifacts/shop-app/src/lib/calculator/engine.ts";
import { emptyDraft } from "../artifacts/shop-app/src/lib/calculator/model.ts";
const cases = [];
function add(mode, overrides = {}, rate = "0.21") {
  const draft = {
    ...emptyDraft(mode),
    price: "890",
    weight: "310",
    ...overrides,
  };
  const calculation = calculate(mode, draft, rate);
  if (!calculation.result) throw new Error(JSON.stringify(calculation.errors));
  cases.push({ mode, draft, rate, actual: calculation.result });
}
add("general");
add("general", { includeTraffic: true });
add("jam");
for (const price of [
  "100",
  "100.000001",
  "500",
  "500.000001",
  "650",
  "650.000001",
  "1000",
])
  add("general", { price, weight: "0" }, "0.2");
for (const price of [
  "600",
  "600.000001",
  "700",
  "700.000001",
  "900",
  "900.000001",
  "1000",
])
  add("jam", { price, weight: "0" }, "0.2");
add("ip", { price: "1980", weight: "250" });
add("ip", { price: "1800", weight: "170" });
for (const weight of ["156.045454", "156.045455"])
  add("ip", { price: "1800", weight });
add("ip", { price: "2000", weight: "0" }, "0.24");
add("ip", { price: "3000", weight: "500" });
add("ip", { price: "8000", weight: "0" }, "0.25");
add("ip", { price: "2000", weight: "999999999.999999", air: "0" }, "0.24");
add("boutique", { price: "8250", weight: "350", vip: "1900" });
add("boutique", {
  price: "8250",
  weight: "350",
  vip: "1900",
  qMode: "manual",
  q: "8250",
});
add("boutique", { price: "1001.000001", weight: "0" });
add("boutique", {
  price: "1001.000001",
  weight: "0",
  qMode: "manual",
  q: "916.4155009155",
});
for (const q of [
  "4999.999",
  "5000",
  "5999.999",
  "6000",
  "6999.999",
  "7000",
  "29999.999",
  "30000",
  "266999.999",
  "267000",
])
  add("boutique", {
    price: "300000",
    weight: "0",
    qMode: "manual",
    q,
    vip: "0",
  });
process.stdout.write(
  execFileSync(
    "python",
    [fileURLToPath(new URL("calculator-arithmetic-audit.py", import.meta.url))],
    { input: JSON.stringify(cases), encoding: "utf8", timeout: 30000 },
  ),
);
