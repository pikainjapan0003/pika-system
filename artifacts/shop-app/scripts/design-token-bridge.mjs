import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SOURCE_COMMIT = "d97d377964bf24fef645b83bad2f11489ebfda90";
const SOURCE_SHA256 =
  "374FED5A44EAFED70AD483CC82BD28838840567EBBFD2E5E137A7AD2A4B4059E";
const INDEX_PATH = "artifacts/shop-app/src/index.css";
const MATRIX_HEADING = "### 108 個既有 CSS 變數";
const GENERATED_START = "/* design-token-bridge:start */";
const GENERATED_END = "/* design-token-bridge:end */";
const EXPORTER_PACKAGE = "@google/design.md@0.4.0";
const PRETTIER_PACKAGE = "prettier@3.8.3";
const BRAND_OVERRIDE_TOKENS = new Set(["--primary", "--primary-foreground"]);

const EXPECTED_THEME_DIFF = new Set([
  "--background",
  "--foreground",
  "--border",
  "--input",
  "--ring",
  "--card",
  "--card-foreground",
  "--card-border",
  "--popover",
  "--popover-foreground",
  "--popover-border",
  "--primary",
  "--primary-foreground",
  "--secondary",
  "--secondary-foreground",
  "--muted",
  "--muted-foreground",
  "--accent",
  "--accent-foreground",
  "--destructive",
  "--destructive-foreground",
  "--sidebar",
  "--sidebar-foreground",
  "--sidebar-border",
  "--sidebar-primary",
  "--sidebar-primary-foreground",
  "--sidebar-accent",
  "--sidebar-accent-foreground",
  "--sidebar-ring",
  "--chart-1",
  "--chart-2",
  "--chart-3",
  "--chart-4",
  "--chart-5",
]);

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDirectory, "../../..");
const designPath = join(repoRoot, "DESIGN.md");
const indexPath = join(repoRoot, INDEX_PATH);

function fail(message) {
  throw new Error(`[design-token-bridge] ${message}`);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex").toUpperCase();
}

function stripCode(value) {
  const trimmed = value.trim();
  return trimmed.startsWith("`") && trimmed.endsWith("`")
    ? trimmed.slice(1, -1)
    : trimmed;
}

function parseMatrix(designSource) {
  const headingStart = designSource.indexOf(MATRIX_HEADING);
  if (headingStart < 0) fail(`missing heading: ${MATRIX_HEADING}`);

  const tableStart = designSource.indexOf("| Token |", headingStart);
  const tableEnd = designSource.indexOf("\n### ", tableStart);
  if (tableStart < 0 || tableEnd < 0) fail("cannot locate the 108-token table");

  const rows = [];
  for (const line of designSource.slice(tableStart, tableEnd).split(/\r?\n/)) {
    if (!line.startsWith("| `--")) continue;
    const cells = line.split("|").slice(1, -1).map(stripCode);
    if (cells.length < 3) fail(`malformed matrix row: ${line}`);

    const [name, light, nightCell] = cells;
    const night = /^(same as Light|same reference)/i.test(nightCell)
      ? light
      : nightCell;
    rows.push({ name, light, night });
  }

  const names = rows.map(({ name }) => name);
  if (rows.length !== 108 || new Set(names).size !== 108) {
    fail(
      `matrix must contain 108 unique rows; got ${rows.length}/${new Set(names).size}`,
    );
  }

  const actualDiff = new Set(
    rows.filter(({ light, night }) => light !== night).map(({ name }) => name),
  );
  const missingDiff = [...EXPECTED_THEME_DIFF].filter(
    (name) => !actualDiff.has(name),
  );
  const extraDiff = [...actualDiff].filter(
    (name) => !EXPECTED_THEME_DIFF.has(name),
  );
  if (missingDiff.length || extraDiff.length) {
    fail(
      `Light/Night diff is not the approved 34-name set; missing=${missingDiff.join(",") || "none"}; extra=${extraDiff.join(",") || "none"}`,
    );
  }

  return rows;
}

function findBalancedBlock(source, selector) {
  const start = source.indexOf(selector);
  if (start < 0) fail(`baseline index.css is missing ${selector}`);
  const open = source.indexOf("{", start);
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") depth -= 1;
    if (depth === 0)
      return { start, end: index + 1, text: source.slice(start, index + 1) };
  }
  fail(`unclosed CSS block: ${selector}`);
}

function parseDeclarations(block) {
  const values = new Map();
  const declarationPattern = /^\s*(--[a-z0-9-]+):\s*([\s\S]*?);/gim;
  for (const match of block.matchAll(declarationPattern)) {
    values.set(match[1], match[2].trim());
  }
  return values;
}

function parseAllNames(cssSource) {
  return new Set(
    [...cssSource.matchAll(/^\s*(--[a-z0-9-]+):/gim)].map((match) => match[1]),
  );
}

function assertSameSet(label, expected, actual) {
  const missing = [...expected].filter((name) => !actual.has(name));
  const extra = [...actual].filter((name) => !expected.has(name));
  if (missing.length || extra.length) {
    fail(
      `${label} name drift; missing=${missing.join(",") || "none"}; extra=${extra.join(",") || "none"}`,
    );
  }
}

function normalizedExporterProjection(designSource) {
  const frontMatterEnd = designSource.indexOf("\n---", 4);
  if (frontMatterEnd < 0) fail("DESIGN.md front matter is not closed");
  const frontMatter = designSource.slice(0, frontMatterEnd + 4);
  const spacingStart = frontMatter.indexOf("\nspacing:\n");
  const spacingEnd = frontMatter.indexOf("\nrounded:\n", spacingStart);
  if (spacingStart < 0 || spacingEnd < 0) {
    fail("cannot locate front matter spacing projection");
  }

  const flattenedSpacing = ["spacing:"];
  const keyPath = [];
  for (const line of frontMatter
    .slice(spacingStart + "\nspacing:\n".length, spacingEnd)
    .split(/\r?\n/)) {
    const match = line.match(/^(\s+)("?[a-z0-9-]+"?):(?:\s+(.+))?$/i);
    if (!match) continue;
    const depth = match[1].length / 2;
    const key = match[2].replaceAll('"', "");
    keyPath[depth - 1] = key;
    keyPath.length = depth;
    if (match[3] !== undefined) {
      flattenedSpacing.push(`  ${keyPath.join("-")}: ${match[3]}`);
    }
  }

  const normalized =
    `${frontMatter.slice(0, spacingStart + 1)}${flattenedSpacing.join("\n")}${frontMatter.slice(spacingEnd)}`.replace(
      /\{spacing\.([a-z0-9.-]+)\}/gi,
      (_, path) => `{spacing.${path.replaceAll(".", "-")}}`,
    );
  return `${normalized}\n\n# Temporary exporter projection\n`;
}

function parseFrontMatterColors(designSource) {
  const frontMatterEnd = designSource.indexOf("\n---", 4);
  const frontMatter = designSource.slice(0, frontMatterEnd);
  const colorsStart = frontMatter.indexOf("\ncolors:\n");
  const colorsEnd = frontMatter.indexOf("\ntypography:\n", colorsStart);
  if (colorsStart < 0 || colorsEnd < 0)
    fail("cannot locate front matter colors");

  const colors = new Map();
  for (const line of frontMatter.slice(colorsStart, colorsEnd).split(/\r?\n/)) {
    const match = line.match(/^  ([a-z0-9-]+): "(hsl\([^)]+\))"$/);
    if (match) colors.set(match[1], match[2]);
  }
  if (colors.size !== 55)
    fail(`expected 55 front matter colors; got ${colors.size}`);
  return colors;
}

function hslToHex(hsl) {
  const match = hsl.match(/^hsl\(([-\d.]+)\s+([\d.]+)%\s+([\d.]+)%\)$/);
  if (!match) fail(`unsupported HSL oracle value: ${hsl}`);
  const hue = (((Number(match[1]) % 360) + 360) % 360) / 360;
  const saturation = Number(match[2]) / 100;
  const lightness = Number(match[3]) / 100;
  const hueToRgb = (p, q, rawT) => {
    let t = rawT;
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  let red = lightness;
  let green = lightness;
  let blue = lightness;
  if (saturation !== 0) {
    const q =
      lightness < 0.5
        ? lightness * (1 + saturation)
        : lightness + saturation - lightness * saturation;
    const p = 2 * lightness - q;
    red = hueToRgb(p, q, hue + 1 / 3);
    green = hueToRgb(p, q, hue);
    blue = hueToRgb(p, q, hue - 1 / 3);
  }
  return `#${[red, green, blue]
    .map((channel) =>
      Math.round(channel * 255)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`.toLowerCase();
}

function runExporterOracle(designSource) {
  const projectionPath = join(
    tmpdir(),
    `pika-design-export-${process.pid}-${Date.now()}.md`,
  );
  writeFileSync(
    projectionPath,
    normalizedExporterProjection(designSource),
    "utf8",
  );
  try {
    const npx = process.platform === "win32" ? "npx.cmd" : "npx";
    const exported = execFileSync(
      npx,
      [
        "--yes",
        `--package=${EXPORTER_PACKAGE}`,
        "designmd",
        "export",
        "--format",
        "css-tailwind",
        projectionPath,
      ],
      {
        cwd: repoRoot,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      },
    );

    const exportedColors = new Map();
    for (const match of exported.matchAll(
      /--color-([a-z0-9-]+):\s*(#[0-9a-f]{6});/gi,
    )) {
      exportedColors.set(match[1], match[2].toLowerCase());
    }
    const sourceColors = parseFrontMatterColors(designSource);
    for (const [name, hsl] of sourceColors) {
      const actual = exportedColors.get(name);
      const expected = hslToHex(hsl);
      if (actual !== expected) {
        fail(
          `exporter Light oracle mismatch for ${name}: expected ${expected}, got ${actual}`,
        );
      }
    }
    for (const required of ["--font-sans", "--font-serif", "--font-mono"]) {
      if (!exported.includes(required))
        fail(`exporter oracle omitted ${required}`);
    }
    return { colorCount: exportedColors.size, exporter: EXPORTER_PACKAGE };
  } finally {
    rmSync(projectionPath, { force: true });
  }
}

function formatGeneratedCss(cssSource) {
  const cssPath = join(
    tmpdir(),
    `pika-design-token-bridge-${process.pid}-${Date.now()}.css`,
  );
  writeFileSync(cssPath, cssSource, "utf8");
  try {
    const npx = process.platform === "win32" ? "npx.cmd" : "npx";
    execFileSync(
      npx,
      [
        "--yes",
        `--package=${PRETTIER_PACKAGE}`,
        "prettier",
        "--write",
        cssPath,
      ],
      {
        cwd: repoRoot,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    return readFileSync(cssPath, "utf8");
  } finally {
    rmSync(cssPath, { force: true });
  }
}

function resolveScopedValue(row, baselineRootValues) {
  if (row.light.startsWith("relative HSL from ")) {
    const inheritedFormula = baselineRootValues.get(row.name);
    if (!inheritedFormula) fail(`baseline formula missing for ${row.name}`);
    return { light: inheritedFormula, night: inheritedFormula };
  }
  return { light: row.light, night: row.night };
}

function renderDeclarations(entries, valueFor) {
  return entries.map((row) => `  ${row.name}: ${valueFor(row)};`).join("\n");
}

function buildCss(designSource, currentCss) {
  if (sha256(designSource) !== SOURCE_SHA256) {
    fail(`DESIGN.md SHA-256 drift; expected ${SOURCE_SHA256}`);
  }
  const rows = parseMatrix(designSource);
  const baselineNames = parseAllNames(currentCss);
  const matrixNames = new Set(rows.map(({ name }) => name));
  if (baselineNames.size !== 108)
    fail(`baseline index.css must expose 108 unique names`);
  assertSameSet(
    "DESIGN.md versus baseline index.css",
    baselineNames,
    matrixNames,
  );

  const rootBlock = findBalancedBlock(currentCss, ":root");
  const baselineRootValues = parseDeclarations(rootBlock.text);
  const aliasRows = rows.filter(({ name }) => !baselineRootValues.has(name));
  const scopedRows = rows.filter(({ name }) => baselineRootValues.has(name));
  if (aliasRows.length !== 48 || scopedRows.length !== 60) {
    fail(
      `expected 48 aliases and 60 scoped values; got ${aliasRows.length}/${scopedRows.length}`,
    );
  }

  const resolved = new Map(
    scopedRows.map((row) => [
      row.name,
      resolveScopedValue(row, baselineRootValues),
    ]),
  );
  const lightBaseRows = scopedRows.filter(
    ({ name }) => !BRAND_OVERRIDE_TOKENS.has(name),
  );
  const lightPrimaryRows = scopedRows.filter(({ name }) =>
    BRAND_OVERRIDE_TOKENS.has(name),
  );
  if (lightBaseRows.length !== 58 || lightPrimaryRows.length !== 2) {
    fail(
      "brand override split must contain 58 base values and the approved primary pair",
    );
  }
  const generated = [
    GENERATED_START,
    `/* source: DESIGN.md@${SOURCE_COMMIT} */`,
    "@theme inline {",
    renderDeclarations(aliasRows, ({ light }) => light),
    "}",
    "",
    rootBlock.text,
    "",
    'body[data-pika-theme="light"] {',
    renderDeclarations(lightBaseRows, ({ name }) => resolved.get(name).light),
    "}",
    "",
    'body[data-pika-theme="light"]:not([data-pika-brand="enabled"]) {',
    renderDeclarations(
      lightPrimaryRows,
      ({ name }) => resolved.get(name).light,
    ),
    "}",
    "",
    'body[data-pika-theme="night"] {',
    renderDeclarations(scopedRows, ({ name }) => resolved.get(name).night),
    "}",
    GENERATED_END,
  ].join("\n");

  const generatedStart = currentCss.indexOf(GENERATED_START);
  const generatedEnd = currentCss.indexOf(GENERATED_END);
  let before;
  let after;
  if (generatedStart >= 0 && generatedEnd >= 0) {
    before = currentCss.slice(0, generatedStart).trimEnd();
    after = currentCss.slice(generatedEnd + GENERATED_END.length).trimStart();
  } else {
    const themeBlock = findBalancedBlock(currentCss, "@theme inline");
    before = currentCss.slice(0, themeBlock.start).trimEnd();
    after = currentCss.slice(rootBlock.end).trimStart();
  }
  const output = `${before}\n\n${generated}\n\n${after}`;
  assertSameSet("generated index.css", baselineNames, parseAllNames(output));
  return formatGeneratedCss(output.endsWith("\n") ? output : `${output}\n`);
}

function main() {
  const mode = process.argv[2];
  if (!new Set(["--write", "--check"]).has(mode)) {
    fail("usage: node design-token-bridge.mjs --write|--check");
  }

  const designSource = readFileSync(designPath, "utf8");
  const oracle = runExporterOracle(designSource);
  const currentCss = readFileSync(indexPath, "utf8");
  const expectedCss = buildCss(designSource, currentCss);
  if (mode === "--write") {
    writeFileSync(indexPath, expectedCss, "utf8");
  } else {
    if (currentCss !== expectedCss)
      fail("index.css is stale; run with --write");
  }

  process.stdout.write(
    `${mode === "--write" ? "wrote" : "verified"} ${INDEX_PATH}; 108 names; 34 scoped differences; ${oracle.colorCount} exporter color oracles (${oracle.exporter})\n`,
  );
}

main();
