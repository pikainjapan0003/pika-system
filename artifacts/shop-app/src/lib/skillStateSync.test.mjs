import assert from "node:assert/strict";
import test from "node:test";

import { refreshSkillStateViews } from "./skillStateSync.ts";

test("skill writes refresh both the map and the app-wide visibility state", async () => {
  const calls = [];

  await refreshSkillStateViews(
    async () => {
      calls.push("map");
    },
    async () => {
      calls.push("visibility");
    },
  );

  assert.deepEqual(calls.sort(), ["map", "visibility"]);
});
