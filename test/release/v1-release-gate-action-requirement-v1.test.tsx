import assert from "node:assert/strict";
import test from "node:test";

import {
  V1_RELEASE_REQUIRED_GATES_V1,
  compileV1ReleaseCertificateV1,
  type V1ReleaseGateEvidenceV1,
  type V1ReleaseGateIdV1
} from "@/lib/release/v1-release-certificate-v1";

const RELEASE_SHA = "b74935560bef46cf61544dcae550c481e683e3f9";
const GENERATED_AT = "2026-09-19T11:00:00.000Z";
const OBSERVED_AT = "2026-09-19T10:55:00.000Z";

function gate(
  gateId: V1ReleaseGateIdV1,
  overrides: Partial<V1ReleaseGateEvidenceV1> = {}
): V1ReleaseGateEvidenceV1 {
  return {
    gateId,
    state: "PASS",
    freshness: "CURRENT",
    observedAt: OBSERVED_AT,
    evidenceRefs: [`github://release-evidence/${gateId.toLowerCase()}`],
    releaseSha: RELEASE_SHA,
    actionRequirement: "NONE",
    ...overrides
  };
}

function passingGates(): V1ReleaseGateEvidenceV1[] {
  return V1_RELEASE_REQUIRED_GATES_V1.map((gateId) => gate(gateId));
}

test("a PASS gate that still requires Keegan action cannot certify release readiness", () => {
  const gates = passingGates().map((entry) =>
    entry.gateId === "IONOS_THREE_MAILBOX_PROOF"
      ? gate("IONOS_THREE_MAILBOX_PROOF", { actionRequirement: "KEEGAN" })
      : entry
  );

  const result = compileV1ReleaseCertificateV1({
    releaseSha: RELEASE_SHA,
    generatedAt: GENERATED_AT,
    gates,
    finalAcceptance: {
      state: "ACCEPTED",
      releaseSha: RELEASE_SHA,
      observedAt: "2026-09-19T10:59:00.000Z",
      evidenceRefs: ["github://release-evidence/final-keegan-acceptance"]
    }
  });

  assert.equal(result.mechanicalState, "BLOCKED");
  assert.equal(result.releaseState, "BLOCKED");
  assert.equal(result.keeganActionRequired, "YES");
  assert.equal(result.certifiedClaims.ionosThreeMailboxProof, false);
  assert.ok(
    result.blockers.some(
      (entry) =>
        entry.code === "GATE_UNRESOLVED_ACTION_REQUIREMENT" &&
        entry.gateId === "IONOS_THREE_MAILBOX_PROOF" &&
        entry.actionRequirement === "KEEGAN"
    )
  );
});

test("a PASS gate with unknown action state fails closed instead of becoming certified truth", () => {
  const gates = passingGates().map((entry) =>
    entry.gateId === "PRODUCTION_SMOKE"
      ? gate("PRODUCTION_SMOKE", { actionRequirement: "UNKNOWN" })
      : entry
  );

  const result = compileV1ReleaseCertificateV1({
    releaseSha: RELEASE_SHA,
    generatedAt: GENERATED_AT,
    gates,
    finalAcceptance: { state: "PENDING" }
  });

  assert.equal(result.mechanicalState, "BLOCKED");
  assert.equal(result.releaseState, "BLOCKED");
  assert.equal(result.keeganActionRequired, "UNKNOWN");
  assert.equal(result.certifiedClaims.productionSmoke, false);
  assert.ok(
    result.blockers.some(
      (entry) =>
        entry.code === "GATE_UNRESOLVED_ACTION_REQUIREMENT" &&
        entry.gateId === "PRODUCTION_SMOKE" &&
        entry.actionRequirement === "UNKNOWN"
    )
  );
});
