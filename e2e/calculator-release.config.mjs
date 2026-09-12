import base from "./calculator.config.mjs";

export default {
  ...base,
  testMatch: "calculator-release.spec.mjs",
  outputDir: "../test-results/calculator-release",
};
