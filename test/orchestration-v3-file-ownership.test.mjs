import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeOwnershipPattern,
  parseOwnershipPatterns,
  ownershipPatternOverlaps,
  ownershipSetsOverlap,
  formatOwnershipPatterns
} from "../scripts/orchestration-v3/file-ownership.mjs";
import { evaluateRoadmapCandidate } from "../scripts/orchestration-v3/roadmap-replenisher.mjs";
import { buildFollowupBody, followupEligibility } from "../scripts/orchestration-v3/followup-materializer.mjs";

test("ownership normalization rejects broad, absolute, parent, and prose patterns", () => {
  assert.equal(normalizeOwnershipPattern("./src/lib/foo.ts"), "src/lib/foo.ts");
  assert.equal(normalizeOwnershipPattern("**/*"), null);
  assert.equal(normalizeOwnershipPattern("/tmp/foo"), null);
  assert.equal(normalizeOwnershipPattern("../foo"), null);
  assert.equal(normalizeOwnershipPattern("some prose ownership"), null);
});

test("path and glob overlap is conservative without substring false positives", () => {
  assert.equal(ownershipPatternOverlaps("src/lib/foo.ts", "src/lib/foobar.ts"), false);
  assert.equal(ownershipPatternOverlaps("src/lib/*.ts", "src/lib/foo.ts"), true);
  assert.equal(ownershipPatternOverlaps("src/a/**/*.ts", "src/b/**/*.ts"), false);
  assert.equal(ownershipSetsOverlap(["src/a/**/*.ts"], ["src/a/foo.ts"]), true);
});

test("multiple explicit ownership paths round-trip deterministically", () => {
  const parsed = parseOwnershipPatterns("src/b.ts, src/a.ts, src/a.ts");
  assert.deepEqual(parsed.valid, ["src/a.ts", "src/b.ts"]);
  assert.deepEqual(parsed.invalid, []);
  assert.equal(formatOwnershipPatterns(["src/b.ts", "src/a.ts"]), "src/a.ts, src/b.ts");
});

test("roadmap candidate fails closed on missing or invalid ownership", () => {
  const base = {
    number: 1234,
    state: "open",
    labels: ["agent-orchestration"],
    body: "**stream:** CORE_INTELLIGENCE\n**priority:** P0\n**human_approval_required:** false"
  };
  const missing = evaluateRoadmapCandidate(base, { uncoveredWorkerIds: ["local-a"] });
  assert.ok(missing.reasons.includes("MISSING_EXPLICIT_FILE_OWNERSHIP"));

  const invalid = evaluateRoadmapCandidate({ ...base, body: `${base.body}\n**file_ownership:** **/*` }, { uncoveredWorkerIds: ["local-a"] });
  assert.ok(invalid.reasons.some((reason) => reason.startsWith("INVALID_FILE_OWNERSHIP:")));
});

test("generated follow-ups emit exact PR file ownership and refuse unknown ownership", () => {
  const work = {
    issueNumber: 678,
    prNumber: 702,
    stream: "QA_EVALUATION",
    reason: "MISSING_VALIDATION_EVIDENCE",
    title: "Collect validation evidence",
    changedFiles: ["src/lib/a.ts", "test/a.test.ts"]
  };
  assert.equal(followupEligibility(work).eligible, true);
  const body = buildFollowupBody(work);
  assert.match(body, /\*\*file_ownership:\*\* src\/lib\/a\.ts, test\/a\.test\.ts/);
  assert.equal(followupEligibility({ ...work, changedFiles: [] }).reason, "MISSING_EXPLICIT_FILE_OWNERSHIP");
});
