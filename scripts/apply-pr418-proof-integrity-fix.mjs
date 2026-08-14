import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const target = 'agent/orch410-openclaw-json-extract';
const wt = path.join(os.tmpdir(), `orch-pr418-proof-integrity-${process.pid}`);
const run = (cmd, args, opts = {}) => execFileSync(cmd, args, {
  encoding: 'utf8',
  stdio: opts.stdio ?? 'inherit',
  cwd: opts.cwd
});

try {
  run('git', ['fetch', 'origin', target]);
  run('git', ['worktree', 'add', '--detach', wt, `origin/${target}`]);

  const runnerPath = path.join(wt, 'scripts/orchestration-run-issue-openclaw.mjs');
  let runner = fs.readFileSync(runnerPath, 'utf8');

  if (!runner.includes('import { spawnSync } from "node:child_process";')) {
    throw new Error('expected spawnSync-only import not found');
  }
  runner = runner.replace(
    'import { spawnSync } from "node:child_process";',
    'import { execFileSync, spawnSync } from "node:child_process";'
  );

  const oldFn = `function extractOpenclawJson(stdout, stderr) {\n  // openclaw sometimes writes logs/warnings to stderr even when --json is set.\n  // Make the structured path robust by extracting the JSON object from combined output.\n  const raw = \`${'${String(stdout ?? "")}'}\\n${'${String(stderr ?? "")}'}\`;\n  const start = raw.indexOf("{");\n  const end = raw.lastIndexOf("}");\n  if (start < 0 || end <= start) return String(stdout ?? "");\n  return raw.slice(start, end + 1);\n}`;

  const newFn = `function collectTopLevelJsonObjects(raw) {\n  const text = String(raw ?? "");\n  const found = [];\n  let start = -1;\n  let depth = 0;\n  let inString = false;\n  let escaped = false;\n\n  for (let i = 0; i < text.length; i += 1) {\n    const ch = text[i];\n    if (inString) {\n      if (escaped) escaped = false;\n      else if (ch === "\\\\") escaped = true;\n      else if (ch === '\"') inString = false;\n      continue;\n    }\n    if (ch === '\"') { inString = true; continue; }\n    if (ch === "{") {\n      if (depth === 0) start = i;\n      depth += 1;\n      continue;\n    }\n    if (ch === "}" && depth > 0) {\n      depth -= 1;\n      if (depth === 0 && start >= 0) {\n        const candidate = text.slice(start, i + 1);\n        try { found.push(JSON.stringify(JSON.parse(candidate))); } catch {}\n        start = -1;\n      }\n    }\n  }\n  return found;\n}\n\nexport function extractOpenclawJson(stdout, stderr) {\n  const candidates = [\n    ...collectTopLevelJsonObjects(stdout),\n    ...collectTopLevelJsonObjects(stderr)\n  ];\n  const unique = [...new Set(candidates)];\n  if (unique.length === 1) return unique[0];\n  if (unique.length > 1) {\n    throw new Error("Ambiguous OpenClaw JSON output: multiple distinct JSON objects");\n  }\n  return String(stdout ?? "");\n}`;

  if (!runner.includes(oldFn)) throw new Error('expected PR418 extractor not found');
  runner = runner.replace(oldFn, newFn);
  fs.writeFileSync(runnerPath, runner);

  const testPath = path.join(wt, 'test/orchestration-openclaw-json-extract.test.tsx');
  fs.writeFileSync(testPath, `import test from "node:test";\nimport assert from "node:assert/strict";\nimport { extractOpenclawJson } from "../scripts/orchestration-run-issue-openclaw.mjs";\n\ntest("extracts clean stdout JSON", () => {\n  assert.equal(extractOpenclawJson('{"ok":true}', ''), '{"ok":true}');\n});\n\ntest("extracts one envelope amid warning noise", () => {\n  assert.equal(extractOpenclawJson('warning\\n{"ok":true}\\ndone', ''), '{"ok":true}');\n});\n\ntest("extracts JSON emitted on stderr", () => {\n  assert.equal(extractOpenclawJson('', 'warning\\n{"ok":true}'), '{"ok":true}');\n});\n\ntest("returns stdout unchanged when no JSON exists", () => {\n  assert.equal(extractOpenclawJson('plain text', 'warning'), 'plain text');\n});\n\ntest("fails closed on multiple conflicting JSON objects", () => {\n  assert.throws(() => extractOpenclawJson('{"a":1}', '{"b":2}'), /Ambiguous OpenClaw JSON output/);\n});\n\ntest("deduplicates identical JSON emitted on both streams", () => {\n  assert.equal(extractOpenclawJson('{"ok":true}', '{"ok":true}'), '{"ok":true}');\n});\n`);

  run('pnpm', ['exec', 'tsx', '--test', 'test/orchestration-openclaw-json-extract.test.tsx'], { cwd: wt });
  run('git', ['diff', '--check'], { cwd: wt });
  run('git', ['add', 'scripts/orchestration-run-issue-openclaw.mjs', 'test/orchestration-openclaw-json-extract.test.tsx'], { cwd: wt });
  run('git', ['commit', '-m', 'Fix PR418 fail-closed JSON extraction'], { cwd: wt });
  run('git', ['push', 'origin', `HEAD:${target}`], { cwd: wt });
  run('git', ['worktree', 'remove', wt]);
  console.log('PR418_CORRECTION_PUSHED=true');
} catch (error) {
  console.error('PR418_CORRECTION_FAILED=true');
  console.error(error?.stack || error?.message || String(error));
  process.exit(1);
}
