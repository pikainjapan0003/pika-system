import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import ts from "typescript";
import Decimal from "decimal.js";
import { D, ceil1, ceil5, exact, money } from "./decimal.ts";
import { calculate, boutiqueProfit } from "./engine.ts";
import {
  emptyDraft,
  emptyDrafts,
  reduceDrafts,
  parseInput,
  autoQ,
} from "./model.ts";
import { RATE_KEY, readRate, saveRate, removeRate } from "./storage.ts";

const run = (mode, overrides = {}, rate = "0.21") => {
  const out = calculate(
    mode,
    { ...emptyDraft(mode), price: "890", weight: "310", ...overrides },
    rate,
  );
  assert.ok(out.result, JSON.stringify(out.errors));
  return out.result;
};
const amounts = (r) => r.quotes.map((q) => [exact(q.sale), exact(q.profit)]);

test("business literals stay in constants rather than calculation or display consumers", () => {
  // An architecture check complements fixed numeric fixtures: equal duplicated
  // rates still pass arithmetic tests, but violate the shared-source contract.
  const misplaced = (source, name) => {
    const file = ts.createSourceFile(
      name,
      source,
      ts.ScriptTarget.Latest,
      true,
      name.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );
    const found = [];
    const visit = (node) => {
      // Literal types describe allowed units; they are not runtime rule values.
      if (ts.isLiteralTypeNode(node)) return;
      const text =
        ts.isStringLiteral(node) ||
        ts.isNoSubstitutionTemplateLiteral(node) ||
        ts.isJsxText(node)
          ? node.text
          : null;
      const numeric = text !== null && /^\d+(?:\.\d+)?$/.test(text);
      const copiedRule =
        text !== null &&
        ((numeric && !["0", "1"].includes(text)) ||
          /\b\d+\.\d+\b|NT\$\s*[1-9]\d*|[1-9]\d{0,2}(?:,\d{3})+/.test(text));
      const numericOperand =
        ts.isNumericLiteral(node) &&
        !["0", "1"].includes(node.text) &&
        (ts.isNewExpression(node.parent) ||
          (ts.isCallExpression(node.parent) &&
            ts.isPropertyAccessExpression(node.parent.expression) &&
            /^(?:mul|div|plus|minus|lt|lte|gt|gte|eq)$/.test(
              node.parent.expression.name.text,
            )));
      if (copiedRule || numericOperand) {
        const { line } = file.getLineAndCharacterOfPosition(
          node.getStart(file),
        );
        found.push(`${name}:${line + 1}: ${node.getText(file)}`);
      }
      ts.forEachChild(node, visit);
    };
    visit(file);
    return found;
  };
  // The reported duplication must be rejected even though both values agree.
  assert.equal(
    misplaced('price.mul("0.9155"); new D("52.5");', "regression.ts").length,
    2,
  );
  assert.equal(
    misplaced(
      "price.mul(BOUTIQUE_TAX_FACTOR); new D(BOUTIQUE_TIGERAIR_RATE_PER_KG);",
      "shared.ts",
    ).length,
    0,
  );
  for (const name of [
    "engine.ts",
    "model.ts",
    "decimal.ts",
    "../../pages/Calculator.tsx",
  ]) {
    const source = readFileSync(new URL(name, import.meta.url), "utf8");
    assert.deepEqual(
      misplaced(source, name),
      [],
      `${name} has a duplicated business value`,
    );
  }
});

test("every valid result identifies the business rules and engineering contract", () => {
  for (const mode of ["general", "jam", "ip", "boutique"]) {
    const result = run(mode, { price: mode === "ip" ? "1800" : "890" });
    assert.equal(result.ruleVersion, "price-calculator-v2-2026-09");
    assert.equal(result.engineeringContractVersion, "CALC-PLAN-v1.2");
  }
  const manual = run("boutique", {
    price: "8250",
    weight: "350",
    qMode: "manual",
    q: "8250",
    vip: ".",
  });
  assert.equal(manual.ruleVersion, "price-calculator-v2-2026-09");
  assert.equal(manual.engineeringContractVersion, "CALC-PLAN-v1.2");
  assert.equal(exact(manual.cost), "1835.71625");
  assert.equal(exact(manual.quotes[0].sale), "2166");
});

test("browser screenshots respect the selected per-test output directory", () => {
  const source = readFileSync(
    new URL("../../../../../e2e/calculator.spec.mjs", import.meta.url),
    "utf8",
  );
  const file = ts.createSourceFile(
    "calculator.spec.mjs",
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.JS,
  );
  let captures = 0;
  const visit = (node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === "screenshot"
    ) {
      captures++;
      const options = node.arguments[0];
      assert.ok(options && ts.isObjectLiteralExpression(options));
      const path = options.properties.find(
        (property) => property.name?.getText(file) === "path",
      );
      assert.ok(
        path &&
          ts.isPropertyAssignment(path) &&
          ts.isCallExpression(path.initializer) &&
          ts.isPropertyAccessExpression(path.initializer.expression) &&
          path.initializer.expression.name.text === "outputPath",
        "A screenshot bypasses Playwright's per-test output directory and may overwrite old evidence",
      );
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  assert.ok(
    captures > 0,
    "The evidence check must inspect actual screenshot calls",
  );
});

// Owner-approved fixed fixtures, transcribed independently of the engine output.
test("profit detail thresholds remain available even when no warning is active", () => {
  for (const mode of ["general", "jam"]) {
    assert.deepEqual(
      run(mode).quotes.map((q) => q.profitThreshold),
      [undefined, undefined],
    );
  }
  const ip = run("ip", { price: "1800", weight: "156.045455" });
  assert.deepEqual(
    ip.quotes.map((q) => q.profitThreshold),
    ["100", "100", "100", "100", "100", "100", "80", "80", "50", "50"],
  );
  assert.equal(exact(ip.cost), "450.0000001");
  assert.equal(exact(ip.quotes[8].profit), "49.9999999");
  assert.equal(ip.quotes[8].warning.type, "PROFIT_BELOW_RECOMMENDED");
  assert.equal(exact(ip.quotes[9].profit), "84.9999999");
  assert.equal(ip.quotes[9].warning, undefined);
  const boutique = run("boutique", {
    price: "8250",
    weight: "350",
    vip: "1900",
  });
  assert.deepEqual(
    boutique.quotes.map((q) => q.profitThreshold),
    [undefined, "0"],
  );
  assert.equal(boutique.quotes[1].warning, undefined);
});

test("four baseline fixtures and exact denominators", () => {
  const general = run("general");
  assert.equal(exact(general.cost), "205.2035");
  assert.deepEqual(amounts(general), [
    ["260", "54.7965"],
    ["255", "49.7965"],
  ]);
  assert.ok(general.breakEven.eq(new D("205.2035").div("890")));
  assert.ok(general.quotes[0].effectiveRate.eq(new D("260").div("890")));
  const traffic = run("general", { includeTraffic: true });
  assert.equal(exact(traffic.cost), "205.2035");
  assert.deepEqual(amounts(traffic), [
    ["295", "89.7965"],
    ["285", "79.7965"],
  ]);
  const jam = run("jam");
  assert.equal(exact(jam.cost), "237.2035");
  assert.deepEqual(amounts(jam), [
    ["350", "112.7965"],
    ["340", "102.7965"],
  ]);
  const ip = run("ip", { price: "1980", weight: "250" });
  assert.equal(exact(ip.cost), "509.037");
  assert.deepEqual(amounts(ip), [
    ["693", "183.963"],
    ["748", "238.963"],
    ["646", "136.963"],
    ["701", "191.963"],
    ["606.2", "97.163"],
    ["662", "152.963"],
    ["586.4", "77.363"],
    ["642", "132.963"],
    ["546.8", "37.763"],
    ["602", "92.963"],
  ]);
  assert.deepEqual(
    ip.quotes.filter((q) => q.warning).map((q) => q.id),
    ["0.29-original", "0.28-original", "0.26-original"],
  );
  assert.ok(ip.quotes[0].margin.eq(new D("183.963").div("693")));
  for (const [qMode, q, cost, sale, profit, vipProfit] of [
    [
      "auto",
      "7552.875",
      "1687.12405625",
      "1990",
      "302.87594375",
      "212.87594375",
    ],
    ["manual", "8250", "1835.71625", "2166", "330.28375", "64.28375"],
  ]) {
    const b = run("boutique", {
      price: "8250",
      weight: "350",
      qMode,
      q,
      vip: "1900",
    });
    assert.equal(exact(b.q), q);
    assert.equal(exact(b.cost), cost);
    assert.deepEqual(amounts(b), [
      [sale, profit],
      ["1900", vipProfit],
    ]);
    assert.ok(b.breakEven.eq(new D(cost).div("8250")));
    assert.ok(b.quotes[0].effectiveRate.eq(new D(sale).div(q)));
  }
});
test("all price and boutique profit tier boundaries retain original discontinuities", () => {
  for (const [p, sale] of [
    ["100", "50"],
    ["100.000001", "45"],
    ["500", "125"],
    ["500.000001", "145"],
    ["650", "175"],
    ["650.000001", "185"],
    ["1000", "255"],
  ])
    assert.equal(
      exact(run("general", { price: p, weight: "0" }, "0.2").quotes[0].sale),
      sale,
    );
  for (const [p, sale] of [
    ["600", "235"],
    ["600.000001", "245"],
    ["700", "265"],
    ["700.000001", "285"],
    ["900", "325"],
    ["900.000001", "345"],
    ["1000", "365"],
  ])
    assert.equal(
      exact(run("jam", { price: p, weight: "0" }, "0.2").quotes[0].sale),
      sale,
    );
  for (const [q, profit] of [
    ["4999.999", "250"],
    ["5000", "300"],
    ["5999.999", "300"],
    ["6000", "350"],
    ["6999.999", "350"],
    ["7000", "280"],
    ["29999.999", "1199.99996"],
    ["30000", "900"],
    ["266999.999", "8009.99997"],
    ["267000", "5340"],
  ])
    assert.equal(exact(boutiqueProfit(new D(q))), profit);
});
test("0.26 new fixture, unformatted threshold, high prices and shared cost", () => {
  const overrides = { price: "1800", weight: "170" };
  const r = run("ip", overrides);
  assert.equal(exact(r.cost), "453.07");
  assert.deepEqual(amounts(r).slice(-2), [
    ["500", "46.93"],
    ["538", "84.93"],
  ]);
  assert.equal(r.quotes[8].warning.threshold, "50");
  assert.equal(r.quotes[9].warning, undefined);
  assert.ok(r.weight.max.eq(new D("34330").div("220")));
  for (const [weight, warned] of [
    ["156.045454", false],
    ["156.045455", true],
  ])
    assert.equal(
      !!run("ip", { ...overrides, weight }).quotes[8].warning,
      warned,
    );
  const heavy = run("ip", { price: "3000", weight: "500" });
  assert.equal(exact(heavy.cost), "781.45");
  assert.equal(exact(heavy.quotes[8].profit), "30.55");
  assert.ok(heavy.quotes[8].warning);
  const traffic = run("ip", { ...overrides, traffic: "500" });
  assert.ok(traffic.quotes[8].profit.eq(r.quotes[8].profit));
  assert.ok(traffic.weight.max.eq(r.weight.max));
});
test("strict threshold below/equal/above for all five IP original and weight options", () => {
  for (const [index, weight, threshold] of [
    [0, "162", "100"],
    [2, "114", "100"],
    [4, "74", "100"],
    [6, "74", "80"],
    [8, "64", "50"],
  ]) {
    for (const delta of ["-0.000001", "0", "0.000001"]) {
      const r = run(
        "ip",
        {
          price: "2000",
          weight: new D(weight).plus(delta).toFixed(),
          air: "1000",
        },
        "0.2",
      );
      assert.ok(r.quotes[index].profit.eq(new D(threshold).minus(delta)));
      assert.equal(!!r.quotes[index].warning, new D(delta).gt("0"));
      // Each quote's own raw profit controls its own warning.
      assert.equal(
        !!r.quotes[index + 1].warning,
        r.quotes[index + 1].profit.lt(threshold),
      );
    }
  }
});
test("independent fixed boundaries for all five IP weight options", () => {
  // At equality, C and the already-ceiled S are integers. Moving W by
  // 0.000001g changes C by 0.000000001 while S stays fixed (A=1).
  for (const [index, rate, weight, sale, cost, threshold] of [
    [1, "0.28", "600", "701", "601", "100"],
    [3, "0.2565", "305", "653", "553", "100"],
    [5, "0.2365", "905", "613", "513", "100"],
    [7, "0.2365", "905", "593", "513", "80"],
    [9, "0.2316", "852", "553", "503", "50"],
  ]) {
    const equal = run("ip", { price: "2000", weight, air: "1" }, rate);
    assert.equal(exact(equal.cost), cost);
    assert.equal(exact(equal.quotes[index].sale), sale);
    assert.equal(exact(equal.quotes[index].profit), threshold);
    assert.equal(equal.quotes[index].warning, undefined);
    for (const [delta, profit, warned] of [
      ["-0.000001", `${threshold}.000000001`, false],
      [
        "0.000001",
        threshold === "100"
          ? "99.999999999"
          : threshold === "80"
            ? "79.999999999"
            : "49.999999999",
        true,
      ],
    ]) {
      const quote = run(
        "ip",
        {
          price: "2000",
          weight: new D(weight).plus(delta).toFixed(),
          air: "1",
        },
        rate,
      ).quotes[index];
      assert.equal(exact(quote.sale), sale);
      assert.equal(exact(quote.profit), profit);
      assert.equal(!!quote.warning, warned);
    }
  }
});
test("actual rounding operands and differences preserve every original pricing position", () => {
  const steps = (result) =>
    result.roundingSteps.map((step) => [
      step.id,
      step.unit,
      exact(step.before),
      exact(step.after),
      exact(step.difference),
    ]);
  assert.deepEqual(steps(run("general", { includeTraffic: true })), [
    ["general-base", "5", "255.2035", "260", "4.7965"],
    ["general-traffic", "5", "292", "295", "3"],
  ]);
  assert.deepEqual(steps(run("general")), [
    ["general-base", "5", "255.2035", "260", "4.7965"],
  ]);
  assert.deepEqual(steps(run("jam")), [
    ["jam-general", "5", "347.2035", "350", "2.7965"],
  ]);
  assert.deepEqual(
    steps(run("boutique", { price: "8250", weight: "350", vip: "1900" })),
    [["boutique-general", "1", "1989.23905625", "1990", "0.76094375"]],
  );
  assert.deepEqual(steps(run("ip", { price: "1980", weight: "250" })), [
    ["0.35-original", null, "693", "693", "0"],
    ["0.35-weight", "1", "748", "748", "0"],
    ["0.31-original", "1", "645.8", "646", "0.2"],
    ["0.31-weight", "1", "700.8", "701", "0.2"],
    ["0.29-original", null, "606.2", "606.2", "0"],
    ["0.29-weight", "1", "661.2", "662", "0.8"],
    ["0.28-original", null, "586.4", "586.4", "0"],
    ["0.28-weight", "1", "641.4", "642", "0.6"],
    ["0.26-original", null, "546.8", "546.8", "0"],
    ["0.26-weight", "1", "601.8", "602", "0.2"],
  ]);
});
test("negative/zero Wmax and zero air avoid dividing by zero", () => {
  const negative = run("ip", { price: "2000", weight: "0" }, "0.24");
  assert.equal(exact(negative.quotes[8].profit), "32.8");
  assert.ok(negative.weight.max.eq(new D("-17200").div("220")));
  const zero = run("ip", { price: "8000", weight: "0" }, "0.25");
  assert.ok(zero.weight.max.isZero());
  assert.equal(zero.quotes[8].warning, undefined);
  assert.ok(
    run("ip", { price: "8000", weight: "0.000001" }, "0.25").quotes[8].warning,
  );
  for (const [price, rate, profit] of [
    ["1800", "0.21", "84.33"],
    ["2000", "0.24", "32.8"],
  ]) {
    const r = run("ip", { price, weight: "999999999.999999", air: "0" }, rate);
    assert.equal(r.weight.kind, "zeroAir");
    assert.equal(exact(r.quotes[8].profit), profit);
  }
});
test("decimal isolation, exact CEILING boundaries and legal automatic/manual Q", () => {
  const previous = Decimal.precision;
  Decimal.set({ precision: 3 });
  try {
    assert.equal(D.precision, 50);
    assert.equal(autoQ("1001.000001"), "916.4155009155");
    const draft = {
      ...emptyDraft("boutique"),
      price: "1001.000001",
      weight: "0",
    };
    const auto = calculate("boutique", draft, "0.21").result;
    const manual = calculate(
      "boutique",
      { ...draft, qMode: "manual", q: autoQ(draft.price) },
      "0.21",
    ).result;
    assert.equal(exact(auto.cost), exact(manual.cost));
    assert.deepEqual(amounts(auto), amounts(manual));
    money(auto.q);
    assert.equal(exact(auto.q), "916.4155009155");
  } finally {
    Decimal.set({ precision: previous });
  }
  for (const [input, one, five] of [
    ["249.999999", "250", "250"],
    ["250", "250", "250"],
    ["250.000001", "251", "255"],
  ]) {
    assert.equal(exact(ceil1(new D(input))), one);
    assert.equal(exact(ceil5(new D(input))), five);
  }
  assert.equal(
    exact(run("ip", { price: "1500", weight: "0" }).quotes[7].sale),
    "452",
  );
  assert.equal(autoQ("999999999.999999"), "915499999.9999990845");
});
test("validation rejects invalid/over-limit strings without truncating, including manual Q", () => {
  for (const text of [
    "",
    ".",
    "1.",
    "-1",
    "1e2",
    "0x10",
    "1,000",
    "NaN",
    "Infinity",
    "abc",
    "1000000000",
    "1.1234567",
  ])
    assert.ok(parseInput(text, "price").error, text);
  assert.equal(exact(parseInput(" .5 ", "price").value), "0.5");
  assert.ok(parseInput("99.12345678", "rate").value);
  assert.ok(parseInput("100", "rate").error);
  assert.ok(parseInput("0.123456789", "rate").error);
  assert.ok(parseInput("916.4155009155", "q").value);
  assert.ok(parseInput("916.41550091551", "q").error);
  assert.ok(
    calculate(
      "general",
      { ...emptyDraft("general"), price: "1001", weight: "0" },
      "0.21",
    ).errors.price,
  );
  assert.ok(
    calculate("ip", { ...emptyDraft("ip"), price: "1000", weight: "0" }, "0.21")
      .errors.price,
  );
  const invalidVIP = calculate(
    "boutique",
    { ...emptyDraft("boutique"), price: "8250", weight: "350", vip: "x" },
    "0.21",
  );
  assert.ok(invalidVIP.result);
  assert.ok(invalidVIP.errors.vip);
  assert.equal(invalidVIP.result.quotes.length, 1);
  assert.equal(
    run("boutique", { vip: "0" }).quotes[1].warning.type,
    "VIP_PRICE_BELOW_COST",
  );
  assert.equal(
    run("general", { weight: "99999" }).quotes.some((q) => q.warning),
    false,
  );
});
test("D2 three operations preserve unrelated drafts; manual Q never silently changes", () => {
  let s = emptyDrafts();
  s = reduceDrafts(s, {
    type: "edit",
    mode: "boutique",
    field: "price",
    value: "1001.000001",
  });
  s = reduceDrafts(s, { type: "qMode", value: "manual" });
  assert.equal(s.boutique.q, "916.4155009155");
  s = reduceDrafts(s, {
    type: "edit",
    mode: "boutique",
    field: "price",
    value: "9000",
  });
  assert.equal(s.boutique.q, "916.4155009155");
  s = reduceDrafts(s, { type: "noTax" });
  assert.equal(s.boutique.q, "9000");
  s = reduceDrafts(s, {
    type: "edit",
    mode: "boutique",
    field: "price",
    value: "8250",
  });
  assert.equal(s.boutique.q, "9000");
  s = reduceDrafts(s, { type: "resetFees", mode: "boutique" });
  assert.equal(s.boutique.q, "9000");
  assert.equal(s.boutique.qMode, "manual");
  s = reduceDrafts(s, { type: "qMode", value: "auto" });
  assert.equal(autoQ(s.boutique.price), "7552.875");
  s = reduceDrafts(s, {
    type: "edit",
    mode: "general",
    field: "air",
    value: "88",
  });
  s = reduceDrafts(s, { type: "trafficToggle", value: true });
  const boutiqueBefore = s.boutique;
  s = reduceDrafts(s, { type: "clearProduct", mode: "general" });
  assert.equal(s.general.air, "88");
  assert.equal(s.general.includeTraffic, true);
  assert.equal(s.boutique, boutiqueBefore);
  s = reduceDrafts(s, { type: "resetFees", mode: "general" });
  assert.equal(s.general.air, "50");
  assert.equal(s.general.includeTraffic, false);
  assert.equal(s.jam.air, "50");
  assert.equal(s.jam.traffic, "32");
  s = reduceDrafts(s, { type: "clearProduct", mode: "boutique" });
  assert.equal(s.boutique.qMode, "auto");
  assert.equal(s.boutique.q, "");
});
test("rate memory only stores valid edits; failed deletion never rewrites old state", () => {
  let value = null;
  const writes = [];
  const storage = {
    getItem: (key) => value,
    setItem: (key, v) => {
      assert.equal(key, RATE_KEY);
      writes.push(v);
      value = v;
    },
    removeItem: (key) => {
      assert.equal(key, RATE_KEY);
      value = null;
    },
  };
  assert.equal(readRate(() => storage).value, "");
  saveRate("0.21", () => storage);
  saveRate("1.", () => storage);
  assert.deepEqual(writes, ["0.21"]);
  assert.equal(readRate(() => storage).value, "0.21");
  assert.equal(removeRate(() => storage).value, "");
  assert.equal(value, null);
  value = "corrupt";
  assert.equal(readRate(() => storage).value, "");
  const denied = () => {
    throw new Error("denied");
  };
  assert.match(readRate(denied).message, /無法/);
  assert.match(saveRate("0.22", denied), /無法/);
  value = "0.21";
  const result = removeRate(() => ({ ...storage, removeItem: denied }));
  assert.equal(result.value, "");
  assert.match(result.message, /刪除失敗/);
  assert.equal(value, "0.21");
  assert.deepEqual(writes, ["0.21"]);
});

test("all four modes clear products and reset fees with exact field isolation", () => {
  for (const mode of ["general", "jam", "ip", "boutique"]) {
    const s = emptyDrafts();
    s[mode] = {
      price: "8250",
      weight: "350",
      air: "123",
      traffic: "99",
      q: "8000.1234567890",
      vip: "1900.123456",
      qMode: "manual",
      includeTraffic: true,
    };
    const productCleared = reduceDrafts(s, { type: "clearProduct", mode });
    assert.deepEqual(productCleared[mode], {
      ...s[mode],
      price: "",
      weight: "",
      q: "",
      vip: "",
      qMode: "auto",
    });
    const feesReset = reduceDrafts(s, { type: "resetFees", mode });
    assert.deepEqual(feesReset[mode], {
      ...s[mode],
      air: emptyDraft(mode).air,
      traffic: "32",
      includeTraffic: mode === "general" ? false : true,
    });
    for (const other of Object.keys(s).filter((key) => key !== mode)) {
      assert.equal(productCleared[other], s[other]);
      assert.equal(feesReset[other], s[other]);
    }
  }
});

test("manual Q remains exact while P/R/W/T and VIP calculations respond immediately", () => {
  const draft = {
    ...emptyDraft("boutique"),
    price: "8250",
    weight: "350",
    qMode: "manual",
    q: "8250",
    vip: "1900",
  };
  const baseline = calculate("boutique", draft, "0.21").result;
  for (const [patch, r] of [
    [{ price: "9000" }, "0.21"],
    [{}, "0.22"],
    [{ weight: "400" }, "0.21"],
    [{ traffic: "40" }, "0.21"],
  ]) {
    const next = calculate("boutique", { ...draft, ...patch }, r).result;
    assert.equal(exact(next.q), "8250");
    assert.equal(exact(next.quotes[1].sale), "1900");
    assert.notEqual(exact(next.cost), exact(baseline.cost));
    assert.notEqual(
      exact(next.quotes[1].profit),
      exact(baseline.quotes[1].profit),
    );
  }
  for (const q of ["", ".", "-1"]) {
    const result = calculate("boutique", { ...draft, q }, "0.21");
    assert.equal(result.result, undefined);
    assert.ok(result.errors.q);
  }
});
