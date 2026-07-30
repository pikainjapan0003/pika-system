import assert from "node:assert/strict";
import test from "node:test";

import "./registerAssetLoader.mjs";

const { default: sevenElevenLogo } =
  await import("../assets/logistics/seven-eleven-logo-official.png");

test("the test asset loader replaces image imports with a stable stub", () => {
  assert.equal(sevenElevenLogo, "test-asset-stub");
});
