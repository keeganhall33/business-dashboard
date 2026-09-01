import test from "node:test";
import assert from "node:assert/strict";

import { SOURCE_AUTHORITY_CONFLICT_FIXTURES_V1 } from "@/lib/external-intelligence/governance/source-authority-conflict-fixtures-v1";
import { buildSourceAuthorityConflictV1 } from "@/lib/external-intelligence/governance/source-authority-conflict-v1";

test("authoritative stale evidence cannot silently override fresher primary evidence", () => {
  const result = buildSourceAuthorityConflictV1(SOURCE_AUTHORITY_CONFLICT_FIXTURES_V1.authoritativeVsStale);

  assert.equal(result.schema_version, "source_authority_conflict_v1");
  assert.equal(result.truth_state, "CONFLICTED");
  assert.equal(result.CURRENT_BEST_EVIDENCE?.evidence_reference_id, "ev_primary_current_opening");
  assert.equal(result.CURRENT_BEST_EVIDENCE?.claim_value, "2026-09-12");
  assert.equal(result.CURRENT_BEST_EVIDENCE?.freshness_state, "CURRENT");
  assert.deepEqual(
    result.WHAT_CONFLICTS.map((item) => item.claim_value).sort(),
    ["2026-07-01", "2026-09-12"]
  );
  assert.ok(result.WHAT_TO_VERIFY_NEXT.some((item) => item.includes("Refresh stale primary-source evidence")));
});

test("two credible conflicting primary sources remain explicit instead of becoming certainty", () => {
  const result = buildSourceAuthorityConflictV1(SOURCE_AUTHORITY_CONFLICT_FIXTURES_V1.twoCredibleConflictingSources);

  assert.equal(result.truth_state, "CONFLICTED");
  assert.equal(result.WHAT_CONFLICTS.length, 2);
  assert.deepEqual(
    result.WHAT_CONFLICTS.map((item) => [item.claim_value, item.evidence_reference_ids[0]]),
    [
      ["Partner A", "ev_league_release_partner"],
      ["Partner B", "ev_brand_release_partner"]
    ]
  );
  assert.ok(result.WHAT_TO_VERIFY_NEXT.some((item) => item.includes("Resolve the conflicting claim values")));
});

test("unsupported claims do not produce current best evidence and keep UNKNOWN visible", () => {
  const result = buildSourceAuthorityConflictV1(SOURCE_AUTHORITY_CONFLICT_FIXTURES_V1.unsupportedClaims);

  assert.equal(result.truth_state, "UNSUPPORTED");
  assert.equal(result.CURRENT_BEST_EVIDENCE, null);
  assert.deepEqual(result.WHAT_CONFLICTS, []);
  assert.ok(result.reviewed_evidence.some((item) => item.claim_value === null && item.support_state === "UNKNOWN"));
  assert.ok(result.WHAT_TO_VERIFY_NEXT.some((item) => item.includes("mark the field UNKNOWN")));
});

test("source authority conflict output is deterministic and immutable", () => {
  const a = buildSourceAuthorityConflictV1(SOURCE_AUTHORITY_CONFLICT_FIXTURES_V1.authoritativeVsStale);
  const b = buildSourceAuthorityConflictV1(SOURCE_AUTHORITY_CONFLICT_FIXTURES_V1.authoritativeVsStale);

  assert.deepEqual(a, b);
  assert.throws(() => {
    (a.reviewed_evidence as unknown[]).push({});
  }, /object is not extensible|Cannot add property/);
});
