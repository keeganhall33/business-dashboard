import assert from "node:assert/strict";
import test from "node:test";

import {
  V1_CRM_REQUIRED_READS_V1,
  compileV1CrmDirectoryReadAuditV1,
  type V1CrmDirectoryReadAuditInputV1,
  type V1CrmDirectoryReadObservationV1
} from "@/lib/release/v1-crm-directory-read-audit-v1";
import {
  V1_RELEASE_REQUIRED_GATES_V1,
  compileV1ReleaseCertificateV1,
  type V1ReleaseGateEvidenceV1
} from "@/lib/release/v1-release-certificate-v1";

const RELEASE_SHA = "346b7ef39329c13d12b1ea4b95438f136d26a717";
const EVALUATED_AT = "2026-09-18T21:30:00.000Z";
const OBSERVED_AT = "2026-09-18T21:25:00.000Z";
const MAX_AGE_MS = 60 * 60 * 1000;

function observation(
  readId: V1CrmDirectoryReadObservationV1["readId"],
  overrides: Partial<V1CrmDirectoryReadObservationV1> = {}
): V1CrmDirectoryReadObservationV1 {
  return {
    readId,
    state: "READ_SUCCEEDED",
    releaseSha: RELEASE_SHA,
    observedAt: OBSERVED_AT,
    source: "CANONICAL_PERSISTED_CRM",
    accessMode: "READ_ONLY",
    fixtureUsed: false,
    mutationAttempted: false,
    evidenceRefs: [`db-read://crm/${readId.toLowerCase()}/release-proof`],
    actionRequirement: "NONE",
    ...overrides
  };
}

function allObservations(): V1CrmDirectoryReadObservationV1[] {
  return V1_CRM_REQUIRED_READS_V1.map((readId) => observation(readId));
}

function input(
  overrides: Partial<V1CrmDirectoryReadAuditInputV1> = {}
): V1CrmDirectoryReadAuditInputV1 {
  return {
    releaseSha: RELEASE_SHA,
    evaluatedAt: EVALUATED_AT,
    maxEvidenceAgeMs: MAX_AGE_MS,
    observations: allObservations(),
    ...overrides
  };
}

function codes(result: ReturnType<typeof compileV1CrmDirectoryReadAuditV1>): string[] {
  return result.blockers.map((entry) => entry.code);
}

test("complete current canonical read-only CRM evidence emits canonical PASS evidence", () => {
  const result = compileV1CrmDirectoryReadAuditV1(input());

  assert.equal(result.blockers.length, 0);
  assert.equal(result.gateEvidence.gateId, "CRM_DIRECTORY_READS");
  assert.equal(result.gateEvidence.state, "PASS");
  assert.equal(result.gateEvidence.freshness, "CURRENT");
  assert.equal(result.gateEvidence.releaseSha, RELEASE_SHA);
  assert.equal(result.gateEvidence.actionRequirement, "NONE");
  assert.deepEqual(result.authority, {
    canMutateCrm: false,
    canCreateIdentity: false,
    canInferRelationship: false,
    canMerge: false,
    canDeploy: false,
    canBypassApproval: false
  });
});

test("the compiled CRM gate is directly compatible with the canonical V1 release certificate", () => {
  const audit = compileV1CrmDirectoryReadAuditV1(input());
  const gates: V1ReleaseGateEvidenceV1[] = V1_RELEASE_REQUIRED_GATES_V1.map((gateId) =>
    gateId === "CRM_DIRECTORY_READS"
      ? audit.gateEvidence
      : {
          gateId,
          state: "PASS",
          freshness: "CURRENT",
          observedAt: OBSERVED_AT,
          evidenceRefs: [`release-proof://${gateId.toLowerCase()}`],
          releaseSha: RELEASE_SHA,
          actionRequirement: "NONE"
        }
  );

  const certificate = compileV1ReleaseCertificateV1({
    releaseSha: RELEASE_SHA,
    generatedAt: EVALUATED_AT,
    gates,
    finalAcceptance: { state: "PENDING" }
  });

  assert.equal(certificate.mechanicalState, "READY");
  assert.equal(certificate.certifiedClaims.crmDirectoryReads, true);
});

test("explicit confirmed-empty reads can prove read-path integrity without manufacturing records", () => {
  const result = compileV1CrmDirectoryReadAuditV1(
    input({
      observations: allObservations().map((entry) =>
        entry.readId === "PEOPLE_DIRECTORY"
          ? observation("PEOPLE_DIRECTORY", { state: "EMPTY_CONFIRMED" })
          : entry
      )
    })
  );

  assert.equal(result.gateEvidence.state, "PASS");
  assert.equal(result.blockers.length, 0);
});

test("missing, partial, failed, unknown, or conflicted reads fail closed", () => {
  const result = compileV1CrmDirectoryReadAuditV1(
    input({
      observations: [
        observation("PEOPLE_DIRECTORY", { state: "PARTIAL" }),
        observation("COMPANIES_DIRECTORY", { state: "CONFLICTED" })
      ]
    })
  );

  assert.equal(result.gateEvidence.state, "BLOCKED");
  assert.equal(result.gateEvidence.freshness, "UNKNOWN");
  assert.ok(codes(result).includes("READ_NOT_COMPLETE"));
  assert.ok(codes(result).includes("MISSING_REQUIRED_READ"));
});

test("duplicate observations cannot be reconciled opportunistically", () => {
  const result = compileV1CrmDirectoryReadAuditV1(
    input({
      observations: [...allObservations(), observation("PEOPLE_DIRECTORY")]
    })
  );

  assert.equal(result.gateEvidence.state, "BLOCKED");
  assert.ok(codes(result).includes("DUPLICATE_REQUIRED_READ"));
});

test("stale, future, and release-SHA-mismatched evidence cannot certify current CRM reads", () => {
  const result = compileV1CrmDirectoryReadAuditV1(
    input({
      observations: allObservations().map((entry) => {
        if (entry.readId === "PEOPLE_DIRECTORY") {
          return observation("PEOPLE_DIRECTORY", { observedAt: "2026-09-18T19:00:00.000Z" });
        }
        if (entry.readId === "COMPANIES_DIRECTORY") {
          return observation("COMPANIES_DIRECTORY", { observedAt: "2026-09-18T21:31:00.000Z" });
        }
        return observation("ACTIVITY_TIMELINE", {
          releaseSha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
        });
      })
    })
  );

  assert.equal(result.gateEvidence.state, "BLOCKED");
  assert.equal(result.gateEvidence.freshness, "STALE");
  assert.ok(codes(result).includes("READ_STALE_EVIDENCE"));
  assert.ok(codes(result).includes("READ_FUTURE_EVIDENCE"));
  assert.ok(codes(result).includes("READ_SHA_MISMATCH"));
});

test("fixture use or any attempted mutation blocks release proof", () => {
  const result = compileV1CrmDirectoryReadAuditV1(
    input({
      observations: allObservations().map((entry) => {
        if (entry.readId === "PEOPLE_DIRECTORY") {
          return observation("PEOPLE_DIRECTORY", { fixtureUsed: true });
        }
        if (entry.readId === "ACTIVITY_TIMELINE") {
          return observation("ACTIVITY_TIMELINE", { mutationAttempted: true });
        }
        return entry;
      })
    })
  );

  assert.equal(result.gateEvidence.state, "BLOCKED");
  assert.ok(codes(result).includes("FIXTURE_USED"));
  assert.ok(codes(result).includes("MUTATION_ATTEMPTED"));
});

test("missing and unsafe provenance fail closed and secret-like content is not echoed", () => {
  const secret = "token=never-echo-this";
  const result = compileV1CrmDirectoryReadAuditV1(
    input({
      observations: allObservations().map((entry) => {
        if (entry.readId === "PEOPLE_DIRECTORY") {
          return observation("PEOPLE_DIRECTORY", { evidenceRefs: [] });
        }
        if (entry.readId === "COMPANIES_DIRECTORY") {
          return observation("COMPANIES_DIRECTORY", { evidenceRefs: [secret] });
        }
        return entry;
      })
    })
  );

  assert.equal(result.gateEvidence.state, "BLOCKED");
  assert.ok(codes(result).includes("READ_MISSING_PROVENANCE"));
  assert.ok(codes(result).includes("READ_UNSAFE_PROVENANCE"));
  assert.equal(JSON.stringify(result).includes("never-echo-this"), false);
  assert.deepEqual(result.gateEvidence.evidenceRefs, []);
});

test("the compiler does not mutate caller-owned read evidence", () => {
  const value = input();
  const before = JSON.stringify(value);

  compileV1CrmDirectoryReadAuditV1(value);

  assert.equal(JSON.stringify(value), before);
});
