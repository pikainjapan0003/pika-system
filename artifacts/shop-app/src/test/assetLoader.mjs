const TEST_ASSET_PATTERN = /\.(?:png|svg|jpe?g)$/i;

export function resolve(specifier, context, nextResolve) {
  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  if (TEST_ASSET_PATTERN.test(new URL(url).pathname)) {
    return {
      format: "module",
      shortCircuit: true,
      source: 'export default "test-asset-stub";',
    };
  }

  return nextLoad(url, context);
}
