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

  const loaded = await nextLoad(url, context);
  if (loaded.format !== "module" || loaded.source == null) return loaded;

  const source = String(loaded.source);
  const transformed = source
    .replaceAll("import.meta.env.BASE_URL", '"/"')
    .replaceAll("import.meta.env.PROD", "false")
    .replaceAll("import.meta.env.DEV", "true")
    .replaceAll("import.meta.env.MODE", '"test"');

  return transformed === source ? loaded : { ...loaded, source: transformed };
}
