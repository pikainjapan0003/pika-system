export type PikaThemeScope = "light" | "night" | "legacy";

const PIKA_PALETTE = "deepsea";

const LIGHT_ROUTES = new Set([
  "/cart",
  "/track",
  "/cvs/711/select",
  "/cvs/711/return",
]);

const NIGHT_ROUTES = new Set([
  "/dashboard",
  "/trips",
  "/reports/monthly-profit",
]);

const LIGHT_ROUTE_PATTERNS = [/^\/p\/[^/]+$/, /^\/track\/[^/]+$/];
const BRAND_OVERRIDE_ROUTES = new Set(["/cart"]);
const BRAND_OVERRIDE_ROUTE_PATTERNS = [/^\/p\/[^/]+$/];
const NIGHT_ROUTE_PATTERNS = [
  /^\/trips\/[^/]+\/estimate$/,
  /^\/trips\/[^/]+\/actual$/,
  /^\/trips\/[^/]+\/comparison$/,
];

function normalizeBasePath(basePath: string): string {
  const withoutQuery = basePath.split(/[?#]/, 1)[0].trim();
  if (!withoutQuery || withoutQuery === "/") return "";
  const withLeadingSlash = withoutQuery.startsWith("/")
    ? withoutQuery
    : `/${withoutQuery}`;
  return withLeadingSlash.replace(/\/+$/, "");
}

export function normalizeThemePath(path: string, basePath = ""): string {
  const pathOnly = path.split(/[?#]/, 1)[0].trim() || "/";
  let normalized = pathOnly.startsWith("/") ? pathOnly : `/${pathOnly}`;
  const normalizedBase = normalizeBasePath(basePath);

  if (normalizedBase) {
    if (normalized === normalizedBase) {
      normalized = "/";
    } else if (normalized.startsWith(`${normalizedBase}/`)) {
      normalized = normalized.slice(normalizedBase.length);
    }
  }

  return normalized.length > 1 ? normalized.replace(/\/+$/, "") : normalized;
}

export function resolveThemeRoute(path: string, basePath = ""): PikaThemeScope {
  const normalized = normalizeThemePath(path, basePath);
  if (
    LIGHT_ROUTES.has(normalized) ||
    LIGHT_ROUTE_PATTERNS.some((pattern) => pattern.test(normalized))
  ) {
    return "light";
  }
  if (
    NIGHT_ROUTES.has(normalized) ||
    NIGHT_ROUTE_PATTERNS.some((pattern) => pattern.test(normalized))
  ) {
    return "night";
  }
  return "legacy";
}

export function resolveBrandOverrideRoute(
  path: string,
  basePath = "",
): boolean {
  const normalized = normalizeThemePath(path, basePath);
  return (
    BRAND_OVERRIDE_ROUTES.has(normalized) ||
    BRAND_OVERRIDE_ROUTE_PATTERNS.some((pattern) => pattern.test(normalized))
  );
}

export function applyThemeRouteScope(
  scope: PikaThemeScope,
  brandOverrideEnabled = false,
  targetDocument: Document = document,
): void {
  const { body } = targetDocument;
  body.dataset.pikaTheme = scope;
  body.dataset.pikaPalette = PIKA_PALETTE;
  body.dataset.pikaBrand = brandOverrideEnabled ? "enabled" : "disabled";
  body.classList.toggle("dark", scope === "night");

  if (scope === "legacy") {
    body.style.removeProperty("color-scheme");
  } else {
    body.style.colorScheme = scope === "night" ? "dark" : "light";
  }
}

export function bootstrapThemeScope(
  path: string,
  basePath = "",
  targetDocument: Document = document,
): PikaThemeScope {
  const scope = resolveThemeRoute(path, basePath);
  applyThemeRouteScope(
    scope,
    resolveBrandOverrideRoute(path, basePath),
    targetDocument,
  );
  return scope;
}
