import { execFileSync } from 'node:child_process';

const repo = 'keeganhall33/business-dashboard';
const target = 'agent/orch410-openclaw-json-extract';

function gh(args, opts = {}) {
  return execFileSync('gh', args, {
    encoding: 'utf8',
    stdio: opts.stdio ?? ['ignore', 'pipe', 'pipe'],
    maxBuffer: 16 * 1024 * 1024
  });
}

function getFile(path) {
  const raw = gh([
    'api', '--method', 'GET',
    `repos/${repo}/contents/${path}`,
    '-f', `ref=${target}`
  ]);
  const obj = JSON.parse(raw);
  return {
    sha: obj.sha,
    text: Buffer.from(String(obj.content || '').replace(/\n/g, ''), 'base64').toString('utf8')
  };
}

function putFile(path, sha, text, message) {
  const encoded = Buffer.from(text, 'utf8').toString('base64');
  gh([
    'api', '--method', 'PUT',
    `repos/${repo}/contents/${path}`,
    '-f', `message=${message}`,
    '-f', `content=${encoded}`,
    '-f', `sha=${sha}`,
    '-f', `branch=${target}`
  ]);
}

try {
  const runnerPath = 'scripts/orchestration-run-issue-openclaw.mjs';
  const runnerFile = getFile(runnerPath);
  let runner = runnerFile.text;

  const importBefore = 'import { spawnSync } from "node:child_process";';
  const importAfter = 'import { execFileSync, spawnSync } from "node:child_process";';
  if (!runner.includes(importBefore)) {
    throw new Error('expected spawnSync-only import not found on PR418 head');
  }
  runner = runner.replace(importBefore, importAfter);

  const oldFn = `function extractOpenclawJson(stdout, stderr) {\n  // openclaw sometimes writes logs/warnings to stderr even when --json is set.\n  // Make the structured path robust by extracting the JSON object from combined output.\n  const raw = \`${'${String(stdout ?? "")}'}\\n${'${String(stderr ?? "")}'}\`;\n  const start = raw.indexOf("{");\n  const end = raw.lastIndexOf("}");\n  if (start < 0 || end <= start) return String(stdout ?? "");\n  return raw.slice(start, end + 1);\n}`;

  const newFn = `function collectTopLevelJsonObjects(raw) {\n  const text = String(raw ?? "");\n  const found = [];\n  let start = -1;\n  let depth = 0;\n  let inString = false;\n  let escaped = false;\n\n  for (let i = 0; i < text.length; i += 1) {\n    const ch = text[i];\n    if (inString) {\n      if (escaped) escaped = false;\n      else if (ch === "\\\\") escaped = true;\n      else if (ch === '\"') inString = false;\n      continue;\n    }\n    if (ch === '\"') { inString = true; continue; }\n    if (ch === "{") {\n      if (depth === 0) start = i;\n      depth += 1;\n      continue;\n    }\n    if (ch === "}" && depth > 0) {\n      depth -= 1;\n      if (depth === 0 && start >= 0) {\n        const candidate = text.slice(start, i + 1);\n        try { found.push(JSON.stringify(JSON.parse(candidate))); } catch {}\n        start = -1;\n      }\n    }\n  }\n  return found;\n}\n\nexport function extractOpenclawJson(stdout, stderr) {\n  const candidates = [\n    ...collectTopLevelJsonObjects(stdout),\n    ...collectTopLevelJsonObjects(stderr)\n  ];\n  const unique = [...new Set(candidates)];\n  if (unique.length === 1) return unique[0];\n  if (unique.length > 1) {\n    throw new Error("Ambiguous OpenClaw JSON output: multiple distinct JSON objects");\n  }\n  return String(stdout ?? "");\n}`;

  if (!runner.includes(oldFn)) {
    throw new Error('expected PR418 extractor not found on PR418 head');
  }
  runner = runner.replace(oldFn, newFn);

  putFile(
    runnerPath,
    runnerFile.sha,
    runner,
    'Fix PR418 fail-closed JSON extraction and child-process import'
  );

  const testPath = 'test/orchestration-openclaw-json-extract.test.tsx';
  const testFile = getFile(testPath);
  const testText = `import test from "node:test";\nimport assert from "node:assert/strict";\nimport { extractOpenclawJson } from "../scripts/orchestration-run-issue-openclaw.mjs";\n\ntest("extracts clean stdout JSON", () => {\n  assert.equal(extractOpenclawJson('{"ok":true}', ''), '{"ok":true}');\n});\n\ntest("extracts one envelope amid warning noise", () => {\n  assert.equal(extractOpenclawJson('warning\\n{"ok":true}\\ndone', ''), '{"ok":true}');\n});\n\ntest("extracts JSON emitted on stderr", () => {\n  assert.equal(extractOpenclawJson('', 'warning\\n{"ok":true}'), '{"ok":true}');\n});\n\ntest("returns stdout unchanged when no JSON exists", () => {\n  assert.equal(extractOpenclawJson('plain text', 'warning'), 'plain text');\n});\n\ntest("fails closed on multiple conflicting JSON objects", () => {\n  assert.throws(() => extractOpenclawJson('{"a":1}', '{"b":2}'), /Ambiguous OpenClaw JSON output/);\n});\n\ntest("deduplicates identical JSON emitted on both streams", () => {\n  assert.equal(extractOpenclawJson('{"ok":true}', '{"ok":true}'), '{"ok":true}');\n});\n`;

  putFile(
    testPath,
    testFile.sha,
    testText,
    'Add executable PR418 JSON extraction regressions'
  );

  console.log('PR418_CORRECTION_PUSHED=true');
} catch (error) {
  console.error('PR418_CORRECTION_FAILED=true');
  console.error(error?.stack || error?.message || String(error));
  process.exit(1);
}
