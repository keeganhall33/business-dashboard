import assert from "node:assert/strict";
import test from "node:test";

import {
  V1_RELEASE_REQUIRED_GATES_V1,
  compileV1ReleaseCertificateV1,
  type V1ReleaseCertificationInputV1,
  type V1ReleaseGateEvidenceV1,
  type V1ReleaseGateIdV1
} from "@/lib/release/v1-release-certificate-v1";

const RELEASE_SHA = "b74935560bef46cf61544dcae550c481e683e3f9";
const GENERATED_AT = "2026-09-18T08:15:00.000Z";
const OBSERVED_AT = "2026-09-18T08:10:00.000Z";

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

function allPassingGates(): V1ReleaseGateEvidenceV1[] {
  return V1_RELEASE_REQUIRED_GATES_V1.map((gateId) => gate(gateId));
}

function input(
  overrides: Partial<V1ReleaseCertificationInputV1> = {}
): V1ReleaseCertificationInputV1 {
  return {
    releaseSha: RELEASE_SHA,
    generatedAt: GENERATED_AT,
    gates: allPassingGates(),
    finalAcceptance: { state: "PENDING" },
    ...overrides
  };
}

function blockerCodes(result: ReturnType<typeof compileV1ReleaseCertificateV1>): string[] {
  return result.blockers.map((entry) => entry.code);
}

test("all mechanical gates can become ready without silently declaring V1 released", () => {
  const result = compileV1ReleaseCertificateV1(input());

  assert.equal(result.mechanicalState, "READY");
  assert.equal(result.releaseState, "READY_FOR_KEEGAN_ACCEPTANCE");
  assert.equal(result.keeganActionRequired, "YES");
  assert.equal(result.blockers.length, 0);
  assert.equal(result.gates.length, V1_RELEASE_REQUIRED_GATES_V1.length);
  assert.ok(result.gates.every((entry) => entry.status === "PASS"));
  assert.deepEqual(result.authority, {
    canDeploy: false,
    canMutateProduction: false,
    canSendEmail: false,
    canBypassApproval: false
  });
});

test("valid final acceptance can mark a mechanically ready certificate released", () => {
  const result = compileV1ReleaseCertificateV1(
    input({
      finalAcceptance: {
        state: "ACCEPTED",
        releaseSha: RELEASE_SHA,
        observedAt: "2026-09-18T08:14:00.000Z",
        evidenceRefs: ["github://release-evidence/final-keegan-acceptance"]
      }
    })
  );

  assert.equal(result.mechanicalState, "READY");
  assert.equal(result.releaseState, "RELEASED");
  assert.equal(result.keeganActionRequired, "NO");
  assert.equal(result.blockers.length, 0);
});

test("final acceptance from a different release SHA cannot be replayed onto the current release", () => {
  const result = compileV1ReleaseCertificateV1(
    input({
      finalAcceptance: {
        state: "ACCEPTED",
        releaseSha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        observedAt: "2026-09-18T08:14:00.000Z",
        evidenceRefs: ["github://release-evidence/prior-release-acceptance"]
      }
    })
  );

  assert.equal(result.mechanicalState, "READY");
  assert.equal(result.releaseState, "BLOCKED");
  assert.equal(result.keeganActionRequired, "YES");
  assert.ok(blockerCodes(result).includes("FINAL_ACCEPTANCE_SHA_MISMATCH"));
});

test("final acceptance must occur after all required mechanical gate evidence", () => {
  const gates = allPassingGates().map((entry) =>
    entry.gateId === "IONOS_THREE_MAILBOX_PROOF"
      ? gate("IONOS_THREE_MAILBOX_PROOF", { observedAt: "2026-09-18T08:13:00.000Z" })
      : entry
  );
  const result = compileV1ReleaseCertificateV1(
    input({
      gates,
      finalAcceptance: {
        state: "ACCEPTED",
        releaseSha: RELEASE_SHA,
        observedAt: "2026-09-18T08:12:00.000Z",
        evidenceRefs: ["github://release-evidence/acceptance-before-ionos-proof"]
      }
    })
  );

  assert.equal(result.mechanicalState, "READY");
  assert.equal(result.releaseState, "BLOCKED");
  assert.equal(result.keeganActionRequired, "YES");
  assert.ok(blockerCodes(result).includes("FINAL_ACCEPTANCE_PRECEDES_GATE_EVIDENCE"));
});

test("the current IONOS-style runtime blocker stays explicit and does not manufacture a Keegan action", () => {
  const gates = allPassingGates().map((entry) =>
    entry.gateId === "IONOS_THREE_MAILBOX_PROOF"
      ? gate("IONOS_THREE_MAILBOX_PROOF", {
          state: "BLOCKED",
          evidenceRefs: ["github://issues/1740#authorized-runtime-proof-pending"],
          actionRequirement: "NONE"
        })
      : entry
  );

  const result = compileV1ReleaseCertificateV1(input({ gates }));

  assert.equal(result.mechanicalState, "BLOCKED");
  assert.equal(result.releaseState, "BLOCKED");
  assert.equal(result.keeganActionRequired, "NO");
  assert.equal(result.certifiedClaims.ionosThreeMailboxProof, false);
  assert.equal(result.certifiedClaims.integratedCode, true);
  assert.ok(
    result.blockers.some(
      (entry) =>
        entry.code === "GATE_NOT_PASS" &&
        entry.gateId === "IONOS_THREE_MAILBOX_PROOF" &&
        entry.actionRequirement === "NONE"
    )
  );
});

test("missing evidence is blocking rather than treated as a passing default", () => {
  const gates = allPassingGates().filter((entry) => entry.gateId !== "P0_CORRECTNESS_SECURITY");
  const result = compileV1ReleaseCertificateV1(input({ gates }));

  assert.equal(result.mechanicalState, "BLOCKED");
  assert.equal(result.certifiedClaims.p0CorrectnessSecurity, false);
  assert.ok(
    result.blockers.some(
      (entry) => entry.code === "MISSING_GATE" && entry.gateId === "P0_CORRECTNESS_SECURITY"
    )
  );
});

test("stale, conflicted, and mismatched-SHA evidence fail closed", () => {
  const gates = allPassingGates().map((entry) => {
    if (entry.gateId === "EXECUTIVE_HOME_TRUTH") {
      return gate("EXECUTIVE_HOME_TRUTH", { freshness: "STALE" });
    }
    if (entry.gateId === "RELEASE_REVIEW_AUDIT") {
      return gate("RELEASE_REVIEW_AUDIT", { state: "CONFLICTED" });
    }
    if (entry.gateId === "PRODUCTION_SMOKE") {
      return gate("PRODUCTION_SMOKE", {
        releaseSha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      });
    }
    return entry;
  });

  const result = compileV1ReleaseCertificateV1(input({ gates }));

  assert.equal(result.mechanicalState, "BLOCKED");
  assert.ok(blockerCodes(result).includes("GATE_NOT_CURRENT"));
  assert.ok(blockerCodes(result).includes("GATE_NOT_PASS"));
  assert.ok(blockerCodes(result).includes("GATE_SHA_MISMATCH"));
  assert.equal(result.certifiedClaims.executiveHomeTruth, false);
  assert.equal(result.certifiedClaims.releaseReviewAudit, false);
  assert.equal(result.certifiedClaims.productionSmoke, false);
});

test("duplicate gate evidence is blocking instead of selecting a convenient winner", () => {
  const gates = allPassingGates();
  gates.push(
    gate("CRM_DIRECTORY_READS", {
      state: "FAIL",
      evidenceRefs: ["github://release-evidence/crm-conflict"]
    })
  );

  const result = compileV1ReleaseCertificateV1(input({ gates }));
  const crm = result.gates.find((entry) => entry.gateId === "CRM_DIRECTORY_READS");

  assert.equal(result.mechanicalState, "BLOCKED");
  assert.equal(crm?.state, "DUPLICATE");
  assert.equal(crm?.status, "BLOCKING");
  assert.ok(
    result.blockers.some(
      (entry) => entry.code === "DUPLICATE_GATE" && entry.gateId === "CRM_DIRECTORY_READS"
    )
  );
});

test("PASS without provenance and future-dated evidence cannot certify a gate", () => {
  const gates = allPassingGates().map((entry) => {
    if (entry.gateId === "INTEGRATED_CODE") {
      return gate("INTEGRATED_CODE", { evidenceRefs: [] });
    }
    if (entry.gateId === "PRODUCTION_PROPAGATION") {
      return gate("PRODUCTION_PROPAGATION", { observedAt: "2026-09-18T08:16:00.000Z" });
    }
    return entry;
  });

  const result = compileV1ReleaseCertificateV1(input({ gates }));

  assert.equal(result.mechanicalState, "BLOCKED");
  assert.ok(blockerCodes(result).includes("GATE_MISSING_PROVENANCE"));
  assert.ok(blockerCodes(result).includes("GATE_FUTURE_EVIDENCE"));
});

test("secret-like provenance is rejected and never echoed into the compiled certificate", () => {
  const secretRef = "token=super-secret-value";
  const gates = allPassingGates().map((entry) =>
    entry.gateId === "PRODUCTION_SMOKE"
      ? gate("PRODUCTION_SMOKE", { evidenceRefs: [secretRef] })
      : entry
  );

  const result = compileV1ReleaseCertificateV1(input({ gates }));

  assert.equal(result.mechanicalState, "BLOCKED");
  assert.ok(blockerCodes(result).includes("GATE_UNSAFE_PROVENANCE"));
  assert.equal(JSON.stringify(result).includes("super-secret-value"), false);
  assert.deepEqual(
    result.gates.find((entry) => entry.gateId === "PRODUCTION_SMOKE")?.evidenceRefs,
    []
  );
});

test("unsafe final-acceptance provenance cannot be emitted or release V1", () => {
  const secretRef = "op://Private/V1 Release Acceptance/password";
  const result = compileV1ReleaseCertificateV1(
    input({
      finalAcceptance: {
        state: "ACCEPTED",
        releaseSha: RELEASE_SHA,
        observedAt: "2026-09-18T08:14:00.000Z",
        evidenceRefs: [secretRef]
      }
    })
  );

  assert.equal(result.mechanicalState, "READY");
  assert.equal(result.releaseState, "BLOCKED");
  assert.equal(result.keeganActionRequired, "YES");
  assert.ok(blockerCodes(result).includes("FINAL_ACCEPTANCE_UNSAFE_PROVENANCE"));
  assert.equal(JSON.stringify(result).includes("op://"), false);
});

test("invalid release identity and invalid evidence timestamps cannot certify readiness", () => {
  const badSha = "not-a-release-sha";
  const gates = allPassingGates().map((entry) => ({
    ...entry,
    releaseSha: badSha,
    observedAt: "not-a-timestamp"
  }));
  const result = compileV1ReleaseCertificateV1(
    input({ releaseSha: badSha, generatedAt: "also-invalid", gates })
  );

  assert.equal(result.mechanicalState, "BLOCKED");
  assert.ok(blockerCodes(result).includes("INVALID_RELEASE_SHA"));
  assert.ok(blockerCodes(result).includes("INVALID_GENERATED_AT"));
  assert.ok(blockerCodes(result).includes("GATE_SHA_MISMATCH"));
  assert.ok(blockerCodes(result).includes("GATE_INVALID_TIMESTAMP"));
  assert.ok(Object.values(result.certifiedClaims).every((claim) => claim === false));
});

test("explicit final rejection remains blocked even after every mechanical gate passes", () => {
  const result = compileV1ReleaseCertificateV1(
    input({
      finalAcceptance: {
        state: "REJECTED",
        observedAt: "2026-09-18T08:14:00.000Z",
        evidenceRefs: ["github://release-evidence/final-keegan-review"]
      }
    })
  );

  assert.equal(result.mechanicalState, "READY");
  assert.equal(result.releaseState, "BLOCKED");
  assert.equal(result.keeganActionRequired, "YES");
  assert.ok(blockerCodes(result).includes("FINAL_ACCEPTANCE_REJECTED"));
});

test("the compiler is deterministic and does not mutate supplied evidence", () => {
  const source = input();
  const before = JSON.stringify(source);

  const first = compileV1ReleaseCertificateV1(source);
  const second = compileV1ReleaseCertificateV1(source);

  assert.deepEqual(first, second);
  assert.equal(JSON.stringify(source), before);
});
