import assert from "node:assert/strict";
import test from "node:test";

import {
  V1_P0_REQUIRED_INVARIANTS_V1,
  compileV1P0CorrectnessSecurityAuditV1,
  type V1P0InvariantObservationV1
} from "@/lib/release/v1-p0-correctness-security-audit-v1";

const RELEASE_SHA = "346b7ef39329c13d12b1ea4b95438f136d26a717";
const EVALUATED_AT = "2026-09-18T20:15:00.000Z";
const OBSERVED_AT = "2026-09-18T20:10:00.000Z";

function invariant(
  invariantId: V1P0InvariantObservationV1["invariantId"]
): V1P0InvariantObservationV1 {
  return {
    invariantId,
    state: "PASS",
    releaseSha: RELEASE_SHA,
    observedAt: OBSERVED_AT,
    evidenceRefs: [`github://release-evidence/${invariantId.toLowerCase()}`],
    actionRequirement: "NONE"
  };
}

test("invalid manifest issue identifiers cannot be silently discarded from an otherwise passing P0 audit", () => {
  const result = compileV1P0CorrectnessSecurityAuditV1({
    releaseSha: RELEASE_SHA,
    evaluatedAt: EVALUATED_AT,
    maxEvidenceAgeMs: 60 * 60 * 1000,
    issueManifest: {
      scope: "OPEN_P0_ISSUES",
      releaseSha: RELEASE_SHA,
      observedAt: OBSERVED_AT,
      issueNumbers: [9001, 0, -1, 1.5],
      evidenceRefs: ["github://issues-search/open-p0-at-release-sha"]
    },
    issueAssessments: [
      {
        issueNumber: 9001,
        releaseSha: RELEASE_SHA,
        observedAt: OBSERVED_AT,
        disposition: "NOT_V1_BLOCKER",
        category: "OTHER",
        evidenceRefs: ["github://issues/9001#v1-scope-audit"],
        actionRequirement: "NONE"
      }
    ],
    invariants: V1_P0_REQUIRED_INVARIANTS_V1.map(invariant)
  });

  assert.equal(result.gateEvidence.state, "BLOCKED");
  assert.equal(result.gateEvidence.freshness, "UNKNOWN");
  assert.equal(result.manifestIssueCount, 1);
  assert.ok(result.blockers.some((entry) => entry.code === "INVALID_MANIFEST_ISSUE_NUMBER"));
  assert.equal(result.authority.canDeploy, false);
  assert.equal(result.authority.canMutateProduction, false);
  assert.equal(result.authority.canBypassApproval, false);
});
