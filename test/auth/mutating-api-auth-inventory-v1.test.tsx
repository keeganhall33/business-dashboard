import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import test from "node:test";

const apiRoot = resolve(process.cwd(), "src/app/api");
const mutatingHandlerPattern = /export\s+(?:async\s+function|const)\s+(POST|PUT|PATCH|DELETE)\b/;

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

function isAuthenticationEndpoint(path: string): boolean {
  return path === "src/app/api/auth/login/route.ts" || path === "src/app/api/auth/logout/route.ts";
}

test("every mutating API route has an explicit production auth boundary", () => {
  const missing: string[] = [];

  for (const file of routeFiles(apiRoot)) {
    const source = readFileSync(file, "utf8");
    if (!mutatingHandlerPattern.test(source)) continue;

    const path = repoPath(file);
    if (isAuthenticationEndpoint(path)) continue;

    const scheduler = path.startsWith("src/app/api/scheduler/");
    const protectedByExpectedBoundary = scheduler
      ? source.includes("assertSchedulerAuth(request)")
      : source.includes("enforceDashboardAuth(request)");

    if (!protectedByExpectedBoundary) missing.push(path);
  }

  assert.deepEqual(
    missing,
    [],
    `mutating API routes must fail closed through dashboard auth or scheduler auth; uncovered routes: ${missing.join(", ")}`
  );
});
