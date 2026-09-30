/** Reject alternate path spellings before generated numeric coercion. */
export function preprocessCatalogParams(input: unknown): unknown {
  if(input===null || typeof input!=="object" || Array.isArray(input))return undefined;
  for(const value of Object.values(input)) {
    if(typeof value==='number')continue;
    if(typeof value!=='string' || !/^[1-9]\d*$/.test(value) || value.trim()!==value)return undefined;
  }
  return input;
}
