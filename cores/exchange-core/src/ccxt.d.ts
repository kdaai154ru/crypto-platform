// Ambient module declaration for ccxt.
// ccxt@4.4.82 ships its own types inside the package, but under CJS
// moduleResolution the compiler sometimes fails to locate them via the
// "exports" map. This file acts as a thin re-export shim so that
// `import * as ccxt from 'ccxt'` in connector.ts always resolves cleanly.
// When ccxt exposes its own declarations this file is a no-op.
declare module 'ccxt' {
  export * from 'ccxt/dist/ccxt.js';
}
