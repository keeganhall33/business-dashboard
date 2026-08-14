import test from "node:test";
import assert from "node:assert/strict";
import { extractOpenclawJson } from "../scripts/orchestration-run-issue-openclaw.mjs";

test("extracts clean stdout JSON", () => {
  assert.equal(extractOpenclawJson('{"ok":true}', ''), '{"ok":true}');
});

test("extracts one envelope amid warning noise", () => {
  assert.equal(extractOpenclawJson('warning\n{"ok":true}\ndone', ''), '{"ok":true}');
});

test("extracts JSON emitted on stderr", () => {
  assert.equal(extractOpenclawJson('', 'warning\n{"ok":true}'), '{"ok":true}');
});

test("returns stdout unchanged when no JSON exists", () => {
  assert.equal(extractOpenclawJson('plain text', 'warning'), 'plain text');
});

test("fails closed on multiple conflicting JSON objects", () => {
  assert.throws(() => extractOpenclawJson('{"a":1}', '{"b":2}'), /Ambiguous OpenClaw JSON output/);
});

test("deduplicates identical JSON emitted on both streams", () => {
  assert.equal(extractOpenclawJson('{"ok":true}', '{"ok":true}'), '{"ok":true}');
});
