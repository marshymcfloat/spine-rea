const urls = [
  ['asset-priest-head', new URL('../assets/priest/head.png?no-inline', import.meta.url).href],
  ['asset-priest-torso', new URL('../assets/priest/torso.png?no-inline', import.meta.url).href],
  ['asset-priest-upper-arm-left', new URL('../assets/priest/upper-arm-left.png?no-inline', import.meta.url).href],
  ['asset-priest-upper-arm-right', new URL('../assets/priest/upper-arm-right.png?no-inline', import.meta.url).href],
  ['asset-priest-forearm-left', new URL('../assets/priest/forearm-left.png?no-inline', import.meta.url).href],
  ['asset-priest-forearm-right', new URL('../assets/priest/forearm-right.png?no-inline', import.meta.url).href],
  ['asset-priest-hand-left', new URL('../assets/priest/hand-left.png?no-inline', import.meta.url).href],
  ['asset-priest-hand-right', new URL('../assets/priest/hand-right.png?no-inline', import.meta.url).href],
  ['asset-priest-robe', new URL('../assets/priest/robe.png?no-inline', import.meta.url).href],
] as const;

/** Optional browser/Vite entry point; ordinary fixture imports do not load media. */
export function createPriestTextureUrls(): ReadonlyMap<string, string> {
  return new Map(urls);
}
