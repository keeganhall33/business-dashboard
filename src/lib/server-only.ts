// Test-safe shim for Next.js server-only marker.
//
// The upstream `server-only` package throws when imported outside a Server Component context.
// Our node:test suite runs in plain Node, so we gate the import.
//
// NOTE: This file must stay side-effect only.
// Import the upstream guard only when we appear to be in a Next.js runtime.
// In plain Node (node:test) this would throw and is not useful.
if (process.env.NEXT_RUNTIME) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require("server-only");
}

export {};
