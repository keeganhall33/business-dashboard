import assert from "node:assert/strict";
import test from "node:test";

import {
  createUnresolvedReferenceV1,
  resolveUnresolvedReferenceV1,
  type CreateUnresolvedReferenceV1Input,
  type UnresolvedReferenceCandidateV1
} from "@/lib/intelligence/knowledge-compilation/unresolved-reference-v1";

const createdAt = "2026-09-12T18:00:00Z";

function baseInput(overrides: Partial<CreateUnresolvedReferenceV1Input> = {}): CreateUnresolvedReferenceV1Input {
  return {
    reference_id: "ref:sarah-legal:1",
    reference_kind: "PERSON",
    display_label: "Sarah from legal",
    provenance_refs: ["email-envelope:42"],
    source_context_id: "email-thread:agreement-follow-up",
    observed_at: "2026-09-12T17:55:00Z",
    effective_at: null,
    affected_canonical_object_ids: ["opportunity:agreement"],
    created_at: createdAt,
    ...overrides
  };
}

function candidate(overrides: Partial<UnresolvedReferenceCandidateV1> = {}): UnresolvedReferenceCandidateV1 {
  return {
    entity_id: "person:sarah-martinez",
    match_evidence_refs: ["email-envelope:84"],
    truth_state: "KNOWN",
    confidence: 0.98,
    direct_identity_evidence: true,
    ...overrides
  };
}

test("unknown Sarah from legal is preserved as an unresolved reference", () => {
  const reference = createUnresolvedReferenceV1(baseInput());

  assert.equal(reference.status, "UNRESOLVED");
  assert.equal(reference.truth_state, "UNKNOWN");
  assert.equal(reference.display_label, "Sarah from legal");
  assert.equal(reference.normalized_label, "sarah from legal");
  assert.deepEqual(reference.provenance_refs, ["email-envelope:42"]);
  assert.equal(reference.resolved_canonical_id, null);
  assert.ok(Object.isFrozen(reference));
  assert.ok(Object.isFrozen(reference.provenance_refs));
});

test("missing label or source evidence fails closed", () => {
  assert.throws(
    () => createUnresolvedReferenceV1(baseInput({ display_label: "" })),
    /DISPLAY_LABEL_REQUIRED/
  );
  assert.throws(
    () => createUnresolvedReferenceV1(baseInput({ provenance_refs: [] })),
    /PROVENANCE_REFS_REQUIRED/
  );
});

test("one supported candidate yields a bounded candidate state without silent canonicalization", () => {
  const reference = createUnresolvedReferenceV1(baseInput());
  const next = resolveUnresolvedReferenceV1(reference, {
    candidates: [candidate()],
    supplied_canonical_ids: ["person:sarah-martinez"],
    policy: { allow_deterministic_resolution: false, minimum_confidence: 0.9 }
  });

  assert.equal(next.status, "CANDIDATES_FOUND");
  assert.equal(next.resolved_canonical_id, null);
  assert.equal(next.candidates.length, 1);
  assert.equal(next.candidates[0].entity_id, "person:sarah-martinez");
});

test("two plausible Sarah candidates require review", () => {
  const reference = createUnresolvedReferenceV1(baseInput());
  const next = resolveUnresolvedReferenceV1(reference, {
    candidates: [
      candidate({ entity_id: "person:sarah-zhang", confidence: 0.91 }),
      candidate({ entity_id: "person:sarah-martinez", confidence: 0.94 })
    ],
    supplied_canonical_ids: ["person:sarah-zhang", "person:sarah-martinez"],
    policy: { allow_deterministic_resolution: true, minimum_confidence: 0.9 },
    resolution_reason: "Direct identity evidence matched later email metadata.",
    resolution_evidence_refs: ["email-envelope:84"]
  });

  assert.equal(next.status, "REVIEW_REQUIRED");
  assert.equal(next.truth_state, "CONFLICTED");
  assert.equal(next.resolved_canonical_id, null);
});

test("later direct identity evidence resolves the prior reference without rewriting source history", () => {
  const reference = createUnresolvedReferenceV1(baseInput());
  const next = resolveUnresolvedReferenceV1(reference, {
    candidates: [candidate()],
    supplied_canonical_ids: ["person:sarah-martinez"],
    policy: { allow_deterministic_resolution: true, minimum_confidence: 0.95 },
    resolution_reason: "Later direct email identity evidence matches the supplied canonical person.",
    resolution_evidence_refs: ["email-envelope:84"]
  });

  assert.equal(next.status, "RESOLVED");
  assert.equal(next.truth_state, "KNOWN");
  assert.equal(next.resolved_canonical_id, "person:sarah-martinez");
  assert.deepEqual(next.provenance_refs, reference.provenance_refs);
  assert.equal(next.source_context_id, reference.source_context_id);
  assert.equal(next.created_at, reference.created_at);
  assert.equal(reference.status, "UNRESOLVED");
  assert.equal(reference.resolved_canonical_id, null);
});

test("a stale candidate cannot auto-resolve", () => {
  const reference = createUnresolvedReferenceV1(baseInput());
  const next = resolveUnresolvedReferenceV1(reference, {
    candidates: [candidate({ truth_state: "STALE" })],
    supplied_canonical_ids: ["person:sarah-martinez"],
    policy: { allow_deterministic_resolution: true, minimum_confidence: 0.9 },
    resolution_reason: "Would otherwise match.",
    resolution_evidence_refs: ["email-envelope:84"]
  });

  assert.equal(next.status, "STALE");
  assert.equal(next.truth_state, "STALE");
  assert.equal(next.resolved_canonical_id, null);
});

test("inferred affiliation cannot become a known resolved fact", () => {
  const reference = createUnresolvedReferenceV1(baseInput());
  const next = resolveUnresolvedReferenceV1(reference, {
    candidates: [candidate({ truth_state: "INFERRED", direct_identity_evidence: false })],
    supplied_canonical_ids: ["person:sarah-martinez"],
    policy: { allow_deterministic_resolution: true, minimum_confidence: 0.9 },
    resolution_reason: "Inference is insufficient.",
    resolution_evidence_refs: ["email-envelope:84"]
  });

  assert.equal(next.status, "CANDIDATES_FOUND");
  assert.equal(next.truth_state, "INFERRED");
  assert.equal(next.resolved_canonical_id, null);
});

test("self resolution and resolution to an unsupplied canonical ID are rejected", () => {
  const reference = createUnresolvedReferenceV1(baseInput());
  const policy = { allow_deterministic_resolution: true, minimum_confidence: 0.9 } as const;

  assert.throws(
    () => resolveUnresolvedReferenceV1(reference, {
      candidates: [candidate({ entity_id: reference.reference_id })],
      supplied_canonical_ids: [reference.reference_id],
      policy,
      resolution_reason: "Invalid self resolution.",
      resolution_evidence_refs: ["email-envelope:84"]
    }),
    /SELF_RESOLUTION_FORBIDDEN/
  );

  assert.throws(
    () => resolveUnresolvedReferenceV1(reference, {
      candidates: [candidate()],
      supplied_canonical_ids: [],
      policy,
      resolution_reason: "Canonical ID was not supplied.",
      resolution_evidence_refs: ["email-envelope:84"]
    }),
    /RESOLUTION_CANONICAL_ID_NOT_SUPPLIED/
  );
});

test("candidate output ordering is deterministic regardless of input order", () => {
  const reference = createUnresolvedReferenceV1(baseInput());
  const first = candidate({ entity_id: "person:sarah-a", confidence: 0.91 });
  const second = candidate({ entity_id: "person:sarah-z", confidence: 0.92 });
  const shared = {
    supplied_canonical_ids: ["person:sarah-z", "person:sarah-a"],
    policy: { allow_deterministic_resolution: false, minimum_confidence: 0.9 }
  } as const;

  const forward = resolveUnresolvedReferenceV1(reference, { ...shared, candidates: [first, second] });
  const reverse = resolveUnresolvedReferenceV1(reference, { ...shared, candidates: [second, first] });

  assert.deepEqual(forward, reverse);
  assert.deepEqual(forward.candidates.map((item) => item.entity_id), ["person:sarah-a", "person:sarah-z"]);
});

test("strict bounds reject raw source bodies and oversized payload fields", () => {
  const rawBodyInput = {
    ...baseInput(),
    source_body: "Full raw email body must never be retained."
  } as unknown as CreateUnresolvedReferenceV1Input;
  assert.throws(() => createUnresolvedReferenceV1(rawBodyInput), /RAW_OR_SECRET_FIELD_FORBIDDEN/);

  assert.throws(
    () => createUnresolvedReferenceV1(baseInput({ display_label: "x".repeat(161) })),
    /DISPLAY_LABEL_TOO_LONG/
  );

  const reference = createUnresolvedReferenceV1(baseInput());
  assert.throws(
    () => resolveUnresolvedReferenceV1(reference, {
      candidates: Array.from({ length: 9 }, (_, index) => candidate({ entity_id: `person:${index}` })),
      supplied_canonical_ids: [],
      policy: { allow_deterministic_resolution: false, minimum_confidence: 0.9 }
    }),
    /CANDIDATES_TOO_MANY/
  );
});
