import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const routePath = "src/app/(app)/learn/page.tsx";

function readLegacyLearningRoute() {
  return readFileSync(resolve(process.cwd(), routePath), "utf8");
}

test("legacy /learn redirects to the canonical /learning workspace", () => {
  const source = readLegacyLearningRoute();

  assert.match(source, /import\s+\{\s*redirect\s*\}\s+from\s+["']next\/navigation["']/);
  assert.match(source, /redirect\(\s*["']\/learning["']\s*\)/);
});

test("legacy /learn no longer owns a separate dashboard or learning data stack", () => {
  const source = readLegacyLearningRoute();

  for (const legacyDependency of [
    "ExecutiveRangeHeader",
    "getDashboardOverview",
    "sanitizeDashboardPayloadForHtml",
    "resolveRangeQuery",
    "LearnVerticalSlice",
  ]) {
    assert.doesNotMatch(source, new RegExp(legacyDependency));
  }
});
