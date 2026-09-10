import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, extname, relative, resolve, sep } from "node:path";
import test from "node:test";

const ROOT = process.cwd();
const APP_ROOT = resolve(ROOT, "src/app/(app)");
const SOURCE_ROOT = resolve(ROOT, "src");
const MAX_MODULES = 500;
const MAX_DEPTH = 40;
const SOURCE_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".mts"] as const;
const BLOCKED_PATH = /(?:^|\/)(?:__fixtures__|fixtures?|demos?|samples?|test-data)(?:\/|\.|$)/i;
const BLOCKED_IMPORT_SYMBOL = /\b(?:FIXTURE|DEMO|SAMPLE|TEST_DATA)\b/;
const EXPLICIT_NON_PRODUCTION_MODE = /\b(?:source_mode|dataMode|mode)\s*:\s*["'](?:FIXTURE|DEMO|SEED_DATA|DETERMINISTIC_FIXTURE)["']\s*[,}]/g;

type Edge = { importer: string; imported: string; statement: string };
type Violation = { route: string; chain: string[]; reason: string };

function repoPath(path: string): string {
  return relative(ROOT, path).split(sep).join("/");
}

function productionPages(dir = APP_ROOT): string[] {
  const output: string[] = [];
  for (const name of readdirSync(dir).sort()) {
    const path = resolve(dir, name);
    const info = statSync(path);
    if (info.isDirectory()) output.push(...productionPages(path));
    else if (name === "page.tsx" || name === "page.ts" || name === "page.jsx" || name === "page.js") output.push(path);
  }
  return output;
}

function importStatements(source: string): Array<{ specifier: string; statement: string }> {
  const output: Array<{ specifier: string; statement: string }> = [];
  const staticPattern = /(?:^|\n)\s*(import|export)\s+(?!type\b)[^;]*?\sfrom\s*["']([^"']+)["']\s*;?/g;
  const sideEffectPattern = /(?:^|\n)\s*import\s*["']([^"']+)["'][^;\n]*;?/g;
  const dynamicPattern = /\b(?:import|require)\s*\(\s*["']([^"']+)["']\s*\)/g;
  for (const match of source.matchAll(staticPattern)) {
    output.push({ specifier: match[2]!, statement: match[0].trim() });
  }
  for (const match of source.matchAll(sideEffectPattern)) {
    output.push({ specifier: match[1]!, statement: match[0].trim() });
  }
  for (const match of source.matchAll(dynamicPattern)) {
    output.push({ specifier: match[1]!, statement: match[0].trim() });
  }
  return output;
}

function resolveLocalImport(importer: string, specifier: string): string | null {
  let base: string;
  if (specifier.startsWith("@/")) base = resolve(SOURCE_ROOT, specifier.slice(2));
  else if (specifier.startsWith(".")) base = resolve(dirname(importer), specifier);
  else return null;
  if (!base.startsWith(`${SOURCE_ROOT}${sep}`) && base !== SOURCE_ROOT) return null;
  const candidates = extname(base)
    ? [base]
    : [base, ...SOURCE_EXTENSIONS.map((extension) => `${base}${extension}`), ...SOURCE_EXTENSIONS.map((extension) => resolve(base, `index${extension}`))];
  return candidates.find((candidate) => existsSync(candidate) && statSync(candidate).isFile()) ?? null;
}

function localEdges(path: string): Edge[] {
  const source = readFileSync(path, "utf8");
  return importStatements(source).flatMap(({ specifier, statement }) => {
    const imported = resolveLocalImport(path, specifier);
    return imported ? [{ importer: path, imported, statement }] : [];
  });
}

function runtimeModeViolations(path: string): string[] {
  const source = readFileSync(path, "utf8");
  return [...source.matchAll(EXPLICIT_NON_PRODUCTION_MODE)].map((match) => match[0]);
}

function inspectRoute(route: string): { visited: Set<string>; violations: Violation[] } {
  const visited = new Set<string>();
  const violations: Violation[] = [];
  const queue: Array<{ path: string; chain: string[]; depth: number }> = [{ path: route, chain: [route], depth: 0 }];
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current.path)) continue;
    if (visited.size >= MAX_MODULES) throw new Error(`${repoPath(route)} exceeded ${MAX_MODULES} local modules`);
    if (current.depth > MAX_DEPTH) throw new Error(`${repoPath(route)} exceeded import depth ${MAX_DEPTH}`);
    visited.add(current.path);

    for (const mode of runtimeModeViolations(current.path)) {
      violations.push({
        route: repoPath(route),
        chain: current.chain.map(repoPath),
        reason: `explicit non-production business-data mode: ${mode}`
      });
    }

    for (const edge of localEdges(current.path)) {
      const nextChain = [...current.chain, edge.imported];
      const importedPath = repoPath(edge.imported);
      if (BLOCKED_PATH.test(importedPath)) {
        violations.push({
          route: repoPath(route),
          chain: nextChain.map(repoPath),
          reason: `runtime import reaches blocked provider path ${importedPath}`
        });
        continue;
      }
      if (BLOCKED_IMPORT_SYMBOL.test(edge.statement)) {
        violations.push({
          route: repoPath(route),
          chain: nextChain.map(repoPath),
          reason: `runtime import names blocked business-data symbol: ${edge.statement}`
        });
        continue;
      }
      queue.push({ path: edge.imported, chain: nextChain, depth: current.depth + 1 });
    }
  }
  return { visited, violations };
}

test("whole-dashboard production routes have no reachable fixture, demo, sample, or test business truth", () => {
  const pages = productionPages();
  assert.ok(pages.length >= 20, "Mission Control production route inventory unexpectedly shrank");
  const required = [
    "executive-home/page.tsx",
    "specialists/financial/page.tsx",
    "specialists/goals-capacity/page.tsx",
    "strategy/page.tsx",
    "opportunities-actions/page.tsx",
    "relationships/page.tsx",
    "events-market-windows/page.tsx",
    "learning/page.tsx",
    "data-evidence/page.tsx"
  ];
  const names = pages.map(repoPath);
  for (const suffix of required) {
    assert.ok(names.some((name) => name.endsWith(suffix)), `missing protected production route ${suffix}`);
  }

  const violations = pages.flatMap((page) => inspectRoute(page).violations);
  const detail = violations.map((item) => `${item.route}: ${item.reason}\n  ${item.chain.join(" -> ")}`).join("\n");
  assert.equal(violations.length, 0, detail);
});
