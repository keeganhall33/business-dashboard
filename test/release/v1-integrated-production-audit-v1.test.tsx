import assert from "node:assert/strict";
import test from "node:test";

import {
  V1_INTEGRATED_CODE_REQUIRED_CHECKS_V1,
  compileV1IntegratedProductionAuditV1,
  type V1IntegratedCodeRequiredCheckIdV1,
  type V1IntegratedProductionAuditInputV1
} from "@/lib/release/v1-integrated-production-audit-v1";
import {
  V1_RELEASE_REQUIRED_GATES_V1,
  compileV1ReleaseCertificateV1,
  type V1ReleaseGateEvidenceV1
} from "@/lib/release/v1-release-certificate-v1";

const RELEASE_SHA = "22603cdc1fb7f4c9764dbd349e3b50af18cb8288";
const EVALUATED_AT = "2026-09-18T22:20:00.000Z";
const VALIDATED_AT = "2026-09-18T22:16:00.000Z";
const PROPAGATED_AT = "2026-09-18T22:18:00.000Z";

function check(checkId: V1IntegratedCodeRequiredCheckIdV1) {
  return {
    checkId,
    state: "PASS" as const,
    releaseSha: RELEASE_SHA,
    observedAt: "2026-09-18T22:15:00.000Z",
    evidenceRefs: [`github://actions/main/${RELEASE_SHA}/${checkId.toLowerCase()}`]
  };
}

function input(
  overrides: Partial<V1IntegratedProductionAuditInputV1> = {}
): V1IntegratedProductionAuditInputV1 {
  return {
    releaseSha: RELEASE_SHA,
    evaluatedAt: EVALUATED_AT,
    maxObservationAgeMs: 60 * 60 * 1000,
    integratedCode: {
      workflowName: "Validated Main",
      branch: "main",
      event: "push",
      state: "PASS",
      releaseSha: RELEASE_SHA,
      completedAt: VALIDATED_AT,
      requiredChecks: V1_INTEGRATED_CODE_REQUIRED_CHECKS_V1.map(check),
      evidenceRefs: [`github://actions/main/${RELEASE_SHA}/validated-main`]
    },
    productionPropagation: {
      provider: "VERCEL",
      environment: "PRODUCTION",
      proofName: "Prove Vercel production propagation",
      state: "DEPLOYED",
      releaseSha: RELEASE_SHA,
      observedAt: PROPAGATED_AT,
      evidenceRefs: [`github://actions/main/${RELEASE_SHA}/production-propagation`]
    },
    ...overrides
  };
}

function issueCodes(
  result: ReturnType<typeof compileV1IntegratedProductionAuditV1>
): string[] {
  return result.issues.map((entry) => entry.code);
}

function mutableInput(): V1IntegratedProductionAuditInputV1 {
  return JSON.parse(JSON.stringify(input())) as V1IntegratedProductionAuditInputV1;
}

test("fresh exact-SHA main validation and separate Vercel proof satisfy canonical release gates", () => {
  const result = compileV1IntegratedProductionAuditV1(input());

  assert.equal(result.disposition, "PASS");
  assert.equal(result.issues.length, 0);
  assert.equal(result.evidence.length, 2);
  assert.deepEqual(
    result.evidence.map((entry) => [entry.gateId, entry.state, entry.freshness]),
    [
      ["INTEGRATED_CODE", "PASS", "CURRENT"],
      ["PRODUCTION_PROPAGATION", "PASS", "CURRENT"]
    ]
  );
  assert.deepEqual(result.authority, {
    canDeploy: false,
    canMutateProduction: false,
    canBypassApproval: false
  });

  const otherGates: V1ReleaseGateEvidenceV1[] = V1_RELEASE_REQUIRED_GATES_V1.filter(
    (gateId) => gateId !== "INTEGRATED_CODE" && gateId !== "PRODUCTION_PROPAGATION"
  ).map((gateId) => ({
    gateId,
    state: "PASS",
    freshness: "CURRENT",
    observedAt: PROPAGATED_AT,
    evidenceRefs: [`github://release/${gateId.toLowerCase()}`],
    releaseSha: RELEASE_SHA,
    actionRequirement: "NONE"
  }));

  const certificate = compileV1ReleaseCertificateV1({
    releaseSha: RELEASE_SHA,
    generatedAt: EVALUATED_AT,
    gates: [...result.evidence, ...otherGates],
    finalAcceptance: { state: "PENDING" }
  });

  assert.equal(certificate.certifiedClaims.integratedCode, true);
  assert.equal(certificate.certifiedClaims.productionPropagation, true);
  assert.equal(certificate.mechanicalState, "READY");
  assert.equal(certificate.releaseState, "READY_FOR_KEEGAN_ACCEPTANCE");
});

test("missing, duplicate, failed, and unknown integrated checks fail closed", () => {
  const missingInput = mutableInput();
  missingInput.integratedCode = {
    ...missingInput.integratedCode,
    requiredChecks: missingInput.integratedCode.requiredChecks.filter(
      (entry) => entry.checkId !== "BUILD"
    )
  };
  const missing = compileV1IntegratedProductionAuditV1(missingInput);
  assert.equal(missing.disposition, "BLOCKED");
  assert.ok(issueCodes(missing).includes("REQUIRED_CHECK_MISSING"));

  const duplicateInput = mutableInput();
  duplicateInput.integratedCode = {
    ...duplicateInput.integratedCode,
    requiredChecks: [
      ...duplicateInput.integratedCode.requiredChecks,
      check("TYPECHECK")
    ]
  };
  const duplicate = compileV1IntegratedProductionAuditV1(duplicateInput);
  assert.equal(duplicate.disposition, "BLOCKED");
  assert.ok(issueCodes(duplicate).includes("REQUIRED_CHECK_DUPLICATE"));

  const failedInput = mutableInput();
  failedInput.integratedCode = {
    ...failedInput.integratedCode,
    requiredChecks: failedInput.integratedCode.requiredChecks.map((entry) =>
      entry.checkId === "TEST" ? { ...entry, state: "FAIL" as const } : entry
    )
  };
  const failed = compileV1IntegratedProductionAuditV1(failedInput);
  assert.equal(failed.disposition, "FAIL");
  assert.ok(issueCodes(failed).includes("REQUIRED_CHECK_FAILED"));

  const unknownInput = mutableInput();
  unknownInput.integratedCode = {
    ...unknownInput.integratedCode,
    requiredChecks: unknownInput.integratedCode.requiredChecks.map((entry) =>
      entry.checkId === "DIFF_CHECK" ? { ...entry, state: "UNKNOWN" as const } : entry
    )
  };
  const unknown = compileV1IntegratedProductionAuditV1(unknownInput);
  assert.equal(unknown.disposition, "BLOCKED");
  assert.ok(issueCodes(unknown).includes("REQUIRED_CHECK_UNKNOWN"));
});

test("pull-request, wrong-branch, cancelled, and wrong-workflow evidence cannot certify integrated main", () => {
  const malformed = mutableInput() as unknown as {
    integratedCode: Record<string, unknown>;
  } & V1IntegratedProductionAuditInputV1;
  malformed.integratedCode.workflowName = "Some Other Workflow";
  malformed.integratedCode.branch = "feature";
  malformed.integratedCode.event = "pull_request";
  malformed.integratedCode.state = "CANCELLED";

  const result = compileV1IntegratedProductionAuditV1(
    malformed as unknown as V1IntegratedProductionAuditInputV1
  );

  assert.equal(result.disposition, "BLOCKED");
  assert.ok(issueCodes(result).includes("INTEGRATED_WORKFLOW_MISMATCH"));
  assert.ok(issueCodes(result).includes("INTEGRATED_BRANCH_MISMATCH"));
  assert.ok(issueCodes(result).includes("INTEGRATED_EVENT_MISMATCH"));
  assert.ok(issueCodes(result).includes("INTEGRATED_STATE_NOT_PASS"));
});

test("explicit integrated or propagation failure remains a known release failure", () => {
  const integratedFailed = mutableInput();
  integratedFailed.integratedCode = {
    ...integratedFailed.integratedCode,
    state: "FAIL"
  };
  const integrated = compileV1IntegratedProductionAuditV1(integratedFailed);
  assert.equal(integrated.disposition, "FAIL");
  assert.ok(issueCodes(integrated).includes("INTEGRATED_STATE_FAILED"));
  assert.equal(integrated.evidence[0].state, "FAIL");

  const propagationFailed = mutableInput();
  propagationFailed.productionPropagation = {
    ...propagationFailed.productionPropagation,
    state: "FAILED"
  };
  const propagated = compileV1IntegratedProductionAuditV1(propagationFailed);
  assert.equal(propagated.disposition, "FAIL");
  assert.ok(issueCodes(propagated).includes("PROPAGATION_FAILED"));
  assert.equal(propagated.evidence[1].state, "FAIL");
});

test("every integrated observation must bind to the exact release SHA", () => {
  const wrongSha = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  const changed = mutableInput();
  changed.integratedCode = {
    ...changed.integratedCode,
    releaseSha: wrongSha,
    requiredChecks: changed.integratedCode.requiredChecks.map((entry) => ({
      ...entry,
      releaseSha: entry.checkId === "BUILD" ? wrongSha : entry.releaseSha
    }))
  };
  changed.productionPropagation = {
    ...changed.productionPropagation,
    releaseSha: wrongSha
  };

  const result = compileV1IntegratedProductionAuditV1(changed);

  assert.equal(result.disposition, "BLOCKED");
  assert.ok(issueCodes(result).includes("INTEGRATED_SHA_MISMATCH"));
  assert.ok(issueCodes(result).includes("REQUIRED_CHECK_SHA_MISMATCH"));
  assert.ok(issueCodes(result).includes("PROPAGATION_SHA_MISMATCH"));
});

test("stale, future, and invalid timestamps cannot remain current release truth", () => {
  const stale = mutableInput();
  stale.maxObservationAgeMs = 60 * 1000;
  const staleResult = compileV1IntegratedProductionAuditV1(stale);
  assert.equal(staleResult.disposition, "BLOCKED");
  assert.ok(issueCodes(staleResult).includes("INTEGRATED_STALE_EVIDENCE"));
  assert.ok(issueCodes(staleResult).includes("PROPAGATION_STALE_EVIDENCE"));
  assert.equal(staleResult.evidence[0].freshness, "STALE");
  assert.equal(staleResult.evidence[1].freshness, "STALE");

  const future = mutableInput();
  future.integratedCode = {
    ...future.integratedCode,
    completedAt: "2026-09-18T22:21:00.000Z"
  };
  future.productionPropagation = {
    ...future.productionPropagation,
    observedAt: "2026-09-18T22:22:00.000Z"
  };
  const futureResult = compileV1IntegratedProductionAuditV1(future);
  assert.ok(issueCodes(futureResult).includes("INTEGRATED_FUTURE_EVIDENCE"));
  assert.ok(issueCodes(futureResult).includes("PROPAGATION_FUTURE_EVIDENCE"));
  assert.equal(futureResult.evidence[0].freshness, "UNKNOWN");
  assert.equal(futureResult.evidence[1].freshness, "UNKNOWN");

  const invalid = mutableInput();
  invalid.integratedCode = { ...invalid.integratedCode, completedAt: "not-a-date" };
  invalid.productionPropagation = {
    ...invalid.productionPropagation,
    observedAt: "not-a-date"
  };
  const invalidResult = compileV1IntegratedProductionAuditV1(invalid);
  assert.ok(issueCodes(invalidResult).includes("INTEGRATED_TIMESTAMP_INVALID"));
  assert.ok(issueCodes(invalidResult).includes("PROPAGATION_TIMESTAMP_INVALID"));
});

test("check chronology and production propagation must follow validation", () => {
  const changed = mutableInput();
  changed.integratedCode = {
    ...changed.integratedCode,
    requiredChecks: changed.integratedCode.requiredChecks.map((entry) =>
      entry.checkId === "BUILD"
        ? { ...entry, observedAt: "2026-09-18T22:17:00.000Z" }
        : entry
    )
  };
  changed.productionPropagation = {
    ...changed.productionPropagation,
    observedAt: "2026-09-18T22:14:00.000Z"
  };

  const result = compileV1IntegratedProductionAuditV1(changed);

  assert.equal(result.disposition, "BLOCKED");
  assert.ok(issueCodes(result).includes("REQUIRED_CHECK_AFTER_WORKFLOW"));
  assert.ok(issueCodes(result).includes("PROPAGATION_PRECEDES_VALIDATION"));
});

test("preview, unknown provider, wrong proof, or unknown propagation cannot certify production", () => {
  const malformed = mutableInput() as unknown as {
    productionPropagation: Record<string, unknown>;
  } & V1IntegratedProductionAuditInputV1;
  malformed.productionPropagation.provider = "OTHER";
  malformed.productionPropagation.environment = "PREVIEW";
  malformed.productionPropagation.proofName = "Generic deploy";
  malformed.productionPropagation.state = "UNKNOWN";

  const result = compileV1IntegratedProductionAuditV1(
    malformed as unknown as V1IntegratedProductionAuditInputV1
  );

  assert.equal(result.disposition, "BLOCKED");
  assert.ok(issueCodes(result).includes("PROPAGATION_PROVIDER_MISMATCH"));
  assert.ok(issueCodes(result).includes("PROPAGATION_ENVIRONMENT_MISMATCH"));
  assert.ok(issueCodes(result).includes("PROPAGATION_PROOF_MISMATCH"));
  assert.ok(issueCodes(result).includes("PROPAGATION_NOT_DEPLOYED"));
  assert.equal(result.evidence[1].state, "BLOCKED");
});

test("missing and secret-like provenance are blocked and redacted", () => {
  const missing = mutableInput();
  missing.integratedCode = { ...missing.integratedCode, evidenceRefs: [] };
  const missingResult = compileV1IntegratedProductionAuditV1(missing);
  assert.equal(missingResult.disposition, "BLOCKED");
  assert.ok(issueCodes(missingResult).includes("MISSING_PROVENANCE"));

  const unsafe = mutableInput();
  unsafe.productionPropagation = {
    ...unsafe.productionPropagation,
    evidenceRefs: ["token=do-not-record-this"]
  };
  const unsafeResult = compileV1IntegratedProductionAuditV1(unsafe);
  assert.equal(unsafeResult.disposition, "BLOCKED");
  assert.ok(issueCodes(unsafeResult).includes("UNSAFE_PROVENANCE"));
  assert.deepEqual(unsafeResult.evidence[1].evidenceRefs, []);
});

test("caller must own a positive finite freshness policy", () => {
  for (const maxObservationAgeMs of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
    const result = compileV1IntegratedProductionAuditV1(
      input({ maxObservationAgeMs })
    );
    assert.equal(result.disposition, "BLOCKED");
    assert.ok(issueCodes(result).includes("INVALID_FRESHNESS_POLICY"));
    assert.equal(result.evidence[0].freshness, "UNKNOWN");
    assert.equal(result.evidence[1].freshness, "UNKNOWN");
  }
});

test("compiler does not mutate supplied evidence", () => {
  const source = mutableInput();
  const before = JSON.stringify(source);

  compileV1IntegratedProductionAuditV1(source);

  assert.equal(JSON.stringify(source), before);
});
