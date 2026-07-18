import assert from "node:assert/strict";
import test from "node:test";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Route, Router, Switch } from "wouter";

import { CUSTOMER_PORTAL_ROUTE_PATTERN } from "./customerRoutes.ts";

function renderRoute(path) {
  return renderToStaticMarkup(
    createElement(
      Router,
      { ssrPath: path },
      createElement(
        Switch,
        null,
        createElement(Route, { path: CUSTOMER_PORTAL_ROUTE_PATTERN }, "customer-portal"),
        createElement(Route, null, "not-found"),
      ),
    ),
  );
}

test("customer portal accepts both the customer list and detail routes", () => {
  assert.equal(renderRoute("/customers"), "customer-portal");
  assert.equal(renderRoute("/customers/1"), "customer-portal");
});

test("customer portal route does not swallow unrelated pages", () => {
  assert.equal(renderRoute("/orders"), "not-found");
});
