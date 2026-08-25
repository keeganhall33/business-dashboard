import assert from "node:assert/strict";
import test from "node:test";

import { resolveSourceAuthorityConflictV1 } from "@/lib/discovery/source-authority-conflict/adapter";
import { SOURCE_AUTHORITY_CONFLICT_FIXTURES_V1 } from "@/lib/discovery/source-authority-conflict/fixtures";

function fixture(id: string) {
  const item = SOURCE_AUTHORITY_CONFLICT_FIXTURES_V1.find((candidate) => candidate.case_id === id);
  assert.ok(item, `missing fixture ${id}`);
  return item;
}

test("fixtures cover authoritative-vs-stale, two credible conflicts, and unsupported claims", () => {
  assert.deepEqual(
    SOURCE_AUTHORITY_CONFLICT_FIXTURES_V1.map((item) => item.case_id),
    [
      "authoritative-vs-stale-primary",
      "two-credible-conflicting-sources",
      "unsupported-relationship-access-claim"
    ]
  );
  assert.ok(SOURCE_AUTHORITY_CONFLICT_FIXTURES_V1.every((item) => item.contract_version === "source_authority_conflict_input_v1"));
});

test("stale authority cannot silently override fresher primary evidence", () => {
  const result = resolveSourceAuthorityConflictV1(fixture("authoritative-vs-stale-primary"));

  assert.equal(result.contract_version, "source_authority_conflict_v1");
  assert.equal(result.status, "CONFLICTED");
  assert.equal(result.CURRENT_BEST_EVIDENCE[0].ref_id, "primary-host-current-cost-coverage");
  assert.equal(result.CURRENT_BEST_EVIDENCE[0].source_authority, "PRIMARY");
  assert.equal(result.CURRENT_BEST_EVIDENCE[0].freshness_state, "FRESH");
  assert.ok(result.CURRENT_BEST_EVIDENCE.some((item) => item.ref_id === "stale-venue-policy-no-cost-coverage" && item.truth_state === "STALE"));
  assert.equal(result.stale_authority_did_not_override_fresher_primary, true);
  assert.match(result.WHAT_TO_VERIFY_NEXT.join(" "), /Refresh stale source authority/);
});

test("two credible conflicting sources remain explicit instead of averaged into certainty", () => {
  const result = resolveSourceAuthorityConflictV1(fixture("two-credible-conflicting-sources"));

  assert.equal(result.status, "CONFLICTED");
  assert.equal(result.WHAT_CONFLICTS.length, 2);
  assert.deepEqual(
    result.CURRENT_BEST_EVIDENCE.map((item) => item.ref_id).sort(),
    ["credible-editorial-calendar-conflict", "credible-editorial-fit-current"]
  );
  assert.ok(result.WHAT_CONFLICTS.every((item) => item.includes("sports-culture-partner-fit")));
  assert.match(result.WHAT_TO_VERIFY_NEXT.join(" "), /Keep both credible conflicting claims visible/);
});

test("unsupported claims stay UNKNOWN and request verification instead of fake confidence", () => {
  const result = resolveSourceAuthorityConflictV1(fixture("unsupported-relationship-access-claim"));

  assert.equal(result.status, "UNKNOWN");
  assert.equal(result.unknown_remains_unknown, true);
  assert.deepEqual(result.unsupported_claim_ref_ids, ["unsupported-warm-intro-rumor"]);
  assert.equal(result.CURRENT_BEST_EVIDENCE[0].truth_state, "UNKNOWN");
  assert.equal(result.CURRENT_BEST_EVIDENCE[0].source_authority, "UNSUPPORTED");
  assert.match(result.WHAT_TO_VERIFY_NEXT.join(" "), /Resolve UNKNOWN or unsupported claims/);
});

test("authority, freshness, directness, and corroboration feed deterministic review priority", () => {
  const result = resolveSourceAuthorityConflictV1(fixture("authoritative-vs-stale-primary"));
  const [freshPrimary, staleOfficial] = result.CURRENT_BEST_EVIDENCE;

  assert.equal(freshPrimary.authority_score, 5);
  assert.equal(freshPrimary.freshness_score, 3);
  assert.equal(freshPrimary.directness_score, 3);
  assert.equal(freshPrimary.corroboration_count, 1);
  assert.ok(freshPrimary.review_priority > staleOfficial.review_priority);
});
