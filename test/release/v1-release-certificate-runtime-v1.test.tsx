import assert from "node:assert/strict";
import test from "node:test";

import {
  V1_RELEASE_REQUIRED_GATES_V1,
  type V1ReleaseCertificationInputV1
} from "@/lib/release/v1-release-certificate-v1";
import {
  compileRuntimeV1ReleaseCertificateV1,
  parseV1ReleaseCertificationInputV1
} from "@/lib/release/v1-release-certificate-runtime-v1";

const RELEASE_SHA = "be7110186228ef54ae3c0a15637f30025aada5da";
const GENERATED_AT = "2026-09-18T17:30:00.000Z";
const OBSERVED_AT = "2026-09-18T17:25:00.000Z";

function validInput(): V1ReleaseCertificationInputV1 {
  return {
    releaseSha: RELEASE_SHA,
    generatedAt: GENERATED_AT,
    gates: V1_RELEASE_REQUIRED_GATES_V1.map((gateId) => ({
      gateId,
      state: "PASS",
      freshness: "CURRENT",
      observedAt: OBSERVED_AT,
      evidenceRefs: [`github://release-evidence/${gateId.toLowerCase()}`],
      releaseSha: RELEASE_SHA,
      actionRequirement: "NONE"
    })),
    finalAcceptance: { state: "PENDING" }
  };
}

test("runtime JSON parsing preserves explicit release evidence without auto-accepting V1", () => {
  const parsed = parseV1ReleaseCertificationInputV1(JSON.parse(JSON.stringify(validInput())) as unknown);
  const certificate = compileRuntimeV1ReleaseCertificateV1(parsed);

  assert.equal(parsed.releaseSha, RELEASE_SHA);
  assert.equal(certificate.mechanicalState, "READY");
  assert.equal(certificate.releaseState, "READY_FOR_KEEGAN_ACCEPTANCE");
  assert.equal(certificate.keeganActionRequired, "YES");
  assert.equal(certificate.authority.canDeploy, false);
  assert.equal(certificate.authority.canMutateProduction, false);
  assert.equal(certificate.authority.canSendEmail, false);
  assert.equal(certificate.authority.canBypassApproval, false);
});

test("runtime parsing rejects unknown release gates instead of silently ignoring them", () => {
  const candidate = validInput() as unknown as { gates: Array<Record<string, unknown>> };
  candidate.gates = [
    ...candidate.gates,
    {
      gateId: "UNDECLARED_RELEASE_GATE",
      state: "PASS",
      freshness: "CURRENT",
      observedAt: OBSERVED_AT,
      evidenceRefs: ["github://release-evidence/undeclared"],
      releaseSha: RELEASE_SHA,
      actionRequirement: "NONE"
    }
  ];

  assert.throws(() => parseV1ReleaseCertificationInputV1(candidate));
});

test("runtime parsing rejects extra truth-like fields that are outside the certificate contract", () => {
  const candidate = {
    ...validInput(),
    productionReady: true
  };

  assert.throws(() => parseV1ReleaseCertificationInputV1(candidate));
});

test("runtime parsing rejects malformed evidence before certificate compilation", () => {
  const candidate = validInput() as unknown as { gates: Array<Record<string, unknown>> };
  candidate.gates = candidate.gates.map((gate, index) =>
    index === 0 ? { ...gate, evidenceRefs: "not-an-array" } : gate
  );

  assert.throws(() => compileRuntimeV1ReleaseCertificateV1(candidate));
});

test("explicit acceptance still must be bound to the exact release SHA", () => {
  const candidate = validInput();
  candidate.finalAcceptance = {
    state: "ACCEPTED",
    releaseSha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    observedAt: "2026-09-18T17:29:00.000Z",
    evidenceRefs: ["github://release-evidence/keegan-acceptance"]
  };

  const certificate = compileRuntimeV1ReleaseCertificateV1(candidate);
  assert.equal(certificate.releaseState, "BLOCKED");
  assert.ok(certificate.blockers.some((blocker) => blocker.code === "FINAL_ACCEPTANCE_SHA_MISMATCH"));
});
