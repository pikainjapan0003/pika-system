import assert from "node:assert/strict";
import test from "node:test";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Route, Router, Switch } from "wouter";

import { CUSTOMER_PORTAL_ROUTE_PATTERN } from "./customerRoutes.ts";
import {
  normalizeThemePath,
  resolveBrandOverrideRoute,
  resolveThemeRoute,
} from "./themeScope.ts";

function renderRoute(path) {
  return renderToStaticMarkup(
    createElement(
      Router,
      { ssrPath: path },
      createElement(
        Switch,
        null,
        createElement(
          Route,
          { path: CUSTOMER_PORTAL_ROUTE_PATTERN },
          "customer-portal",
        ),
        createElement(Route, null, "not-found"),
      ),
    ),
  );
}

test("customer portal accepts both the customer list and detail routes", () => {
  assert.equal(renderRoute("/customers"), "customer-portal");
  assert.equal(renderRoute("/customers/1"), "customer-portal");

  for (const path of [
    "/cart",
    "/p/store-a",
    "/track",
    "/track/order-a",
    "/cvs/711/select",
    "/cvs/711/return",
  ]) {
    assert.equal(resolveThemeRoute(path), "light", path);
  }
  for (const path of [
    "/dashboard",
    "/trips",
    "/trips/1/estimate",
    "/trips/1/actual",
    "/trips/1/comparison",
    "/reports/monthly-profit",
  ]) {
    assert.equal(resolveThemeRoute(path), "night", path);
  }

  assert.equal(
    normalizeThemePath("/app/dashboard/?tab=1#kpi", "/app/"),
    "/dashboard",
  );
  assert.equal(resolveThemeRoute("/app/cart?source=admin", "/app"), "light");
  assert.equal(resolveBrandOverrideRoute("/app/cart", "/app"), true);
  assert.equal(resolveBrandOverrideRoute("/app/p/store-a", "/app"), true);
});

test("customer portal route does not swallow unrelated pages", () => {
  assert.equal(renderRoute("/orders"), "not-found");

  for (const path of [
    "/products",
    "/orders",
    "/settings",
    "/dashboardx",
    "/x/dashboard",
    "/trips/1/estimate/more",
    "/p/a/b",
    "/baseball/cart",
  ]) {
    assert.equal(resolveThemeRoute(path, "/base"), "legacy", path);
    assert.equal(resolveBrandOverrideRoute(path, "/base"), false, path);
  }
  assert.equal(resolveBrandOverrideRoute("/track/order-a"), false);
});
