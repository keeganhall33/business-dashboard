import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import test from "node:test";

const apiRoot = resolve(process.cwd(), "src/app/api");
const readHandlerPattern = /export\s+(?:async\s+function|const)\s+GET\b/;

function routeFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) return routeFiles(path);
      return entry.isFile() && entry.name === "route.ts" ? [path] : [];
    })
    .sort((left, right) => left.localeCompare(right));
}

function repoPath(path: string): string {
  return relative(process.cwd(), path).split(sep).join("/");
}

/**
 * Deliberately tiny public-read allowlist. Every other GET under /api is private
 * dashboard/scheduler data and must carry an explicit route-level boundary because
 * the production proxy does not protect /api globally.
 *
 * Additions require a security review and a comment explaining why anonymous
 * internet access is part of the product contract.
 */
const ANONYMOUS_GET_ALLOWLIST = new Set([
  // Vercel propagation/availability probe. Payload is intentionally non-private.
  "src/app/api/health/route.ts",
]);

test("every non-public GET API route has an explicit production auth boundary", () => {
  const missing: string[] = [];

  for (const file of routeFiles(apiRoot)) {
    const source = readFileSync(file, "utf8");
    if (!readHandlerPattern.test(source)) continue;

    const path = repoPath(file);
    if (ANONYMOUS_GET_ALLOWLIST.has(path)) continue;

    const protectedByExpectedBoundary =
      source.includes("enforceDashboardAuth(request)") ||
      source.includes("assertSchedulerAuth(request)");

    if (!protectedByExpectedBoundary) missing.push(path);
  }

  assert.deepEqual(
    missing,
    [],
    `read API routes must fail closed through dashboard auth or scheduler auth; uncovered routes: ${missing.join(", ")}`
  );
});
