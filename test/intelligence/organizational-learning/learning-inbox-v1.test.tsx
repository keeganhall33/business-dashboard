import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { LearningInboxV1 } from "@/components/intelligence/LearningInboxV1";
import {
  buildLearningInboxV1,
  type LearningInboxInputV1
} from "@/lib/intelligence/organizational-learning/learning-inbox-v1";
import type { LearningObjectV1 } from "@/lib/intelligence/organizational-learning/learning-object-v1";

function learning(overrides: Partial<LearningObjectV1> = {}): LearningObjectV1 {
  return {
    contract_version: "LEARNING_OBJECT_V1",
    learning_id: "learning:1",
    version: 1,
    kind: "VALIDATED_LESSON",
    lifecycle_state: "CANDIDATE",
    truth_state: "KNOWN",
    scope: "COMPANY",
    title: "Evidence-backed lesson",
    content: "Supported belief for governed review.",
    confidence: 0.8,
    created_at: "2026-09-14T00:00:00Z",
    updated_at: "2026-09-14T00:00:00Z",
    evidence: [{ evidence_id: "e:1", source_lineage_id: "s:1", observed_at: "2026-09-14T00:00:00Z" }],
    approval: null,
    supersession: null,
    ...overrides
  };
}

function view(input: Partial<LearningInboxInputV1> = {}) {
  return buildLearningInboxV1({ learning_objects: [learning()], ...input });
}

test("distinguishes all seven lifecycle presentation states", () => {
  const candidate = learning({ learning_id: "candidate" });
  const corroborated = learning({ learning_id: "corroborated", evidence: [
    { evidence_id: "e:1", source_lineage_id: "s:1", observed_at: "2026-09-14T00:00:00Z" },
    { evidence_id: "e:2", source_lineage_id: "s:2", observed_at: "2026-09-14T00:00:00Z" }
  ] });
  const reviewed = learning({ learning_id: "reviewed" });
  const approved = learning({ learning_id: "approved", lifecycle_state: "APPROVED", approval: {
    reviewer_id: "reviewer:1", reviewed_at: "2026-09-14T01:00:00Z", decision: "APPROVE"
  }, updated_at: "2026-09-14T01:00:00Z" });
  const conflicted = learning({ learning_id: "conflicted", truth_state: "CONFLICTED" });
  const rejected = learning({ learning_id: "rejected" });
  const superseded = learning({ learning_id: "superseded", lifecycle_state: "SUPERSEDED", supersession: {
    predecessor_id: "previous:1", reason: "Newer evidence", superseded_at: "2026-09-14T01:00:00Z"
  }, updated_at: "2026-09-14T01:00:00Z" });
  const result = buildLearningInboxV1({
    learning_objects: [candidate, corroborated, reviewed, approved, conflicted, rejected, superseded],
    reviews: [
      { learning_id: "reviewed", decision: "REVIEWED", reviewed_at: "2026-09-14T01:00:00Z", evidence_ids: ["e:1"] },
      { learning_id: "rejected", decision: "REJECT", reviewed_at: "2026-09-14T01:00:00Z", evidence_ids: ["e:1"] }
    ]
  });
  assert.deepEqual(new Set(result.items.map((item) => item.state)), new Set([
    "CANDIDATE", "CORROBORATED", "REVIEWED", "APPROVED", "CONFLICTED", "REJECTED", "SUPERSEDED"
  ]));
});

test("review-required conflicts rank first", () => {
  const result = buildLearningInboxV1({ learning_objects: [
    learning({ learning_id: "approved", lifecycle_state: "APPROVED", approval: { reviewer_id: "r", reviewed_at: "2026-09-14T01:00:00Z", decision: "APPROVE" }, updated_at: "2026-09-14T01:00:00Z" }),
    learning({ learning_id: "conflict", truth_state: "CONFLICTED" })
  ] });
  assert.equal(result.items[0].learning_id, "conflict");
  assert.equal(result.items[0].review_required, true);
});

test("UNKNOWN STALE and CONFLICTED truth remain review-required and never company truth", () => {
  for (const truth_state of ["UNKNOWN", "STALE", "CONFLICTED"] as const) {
    const object = learning({ learning_id: truth_state, truth_state });
    const item = buildLearningInboxV1({ learning_objects: [object] }).items[0];
    assert.equal(item.review_required, true);
    assert.equal(item.company_truth, false);
  }
});

test("only canonical safe truth is represented as company truth", () => {
  const canonical = learning({
    lifecycle_state: "CANONICAL",
    approval: { reviewer_id: "r", reviewed_at: "2026-09-14T01:00:00Z", decision: "APPROVE" },
    updated_at: "2026-09-14T01:00:00Z"
  });
  assert.equal(buildLearningInboxV1({ learning_objects: [canonical] }).items[0].company_truth, true);
  assert.equal(view().items[0].company_truth, false);
});

test("unsupported fields and secret-shaped fields cannot enter the projection", () => {
  const unsafe = { ...learning(), unsupported_claim: "not supported", api_token: "top-secret" } as LearningObjectV1;
  const serialized = JSON.stringify(buildLearningInboxV1({ learning_objects: [unsafe] }));
  assert.doesNotMatch(serialized, /unsupported_claim|not supported|api_token|top-secret/);
});

test("affected consumers require evidence support", () => {
  const result = view({ affected_consumers: [
    { learning_id: "learning:1", consumer_id: "dashboard", consumer_label: "Executive Home", evidence_ids: ["e:1"] },
    { learning_id: "learning:1", consumer_id: "ads", consumer_label: "Meta policy", evidence_ids: ["missing"] }
  ] });
  assert.deepEqual(result.items[0].affected_consumers.map((consumer) => consumer.consumer_id), ["dashboard"]);
});

test("ordering is deterministic independent of input order", () => {
  const a = learning({ learning_id: "a", updated_at: "2026-09-14T01:00:00Z" });
  const b = learning({ learning_id: "b", updated_at: "2026-09-14T01:00:00Z" });
  assert.deepEqual(
    buildLearningInboxV1({ learning_objects: [a, b] }).items,
    buildLearningInboxV1({ learning_objects: [b, a] }).items
  );
});

test("missing command handler forces read-only review behavior", () => {
  const result = view();
  assert.equal(result.read_only, true);
  assert.equal(result.review_command, "UNAVAILABLE");
  assert.equal(result.items[0].action_available, false);
});

test("empty and unavailable feeds render distinct truthful states", () => {
  const empty = buildLearningInboxV1({ learning_objects: [] });
  const unavailable = buildLearningInboxV1({ learning_objects: null });
  assert.equal(empty.coverage, "AVAILABLE");
  assert.equal(empty.items.length, 0);
  assert.equal(unavailable.coverage, "UNAVAILABLE");
  assert.match(renderToStaticMarkup(<LearningInboxV1 view={unavailable} />), /No fixture, inferred belief, or synthetic record/);
});

test("builder does not mutate inputs and freezes its output", () => {
  const source = learning();
  const before = structuredClone(source);
  const result = buildLearningInboxV1({ learning_objects: [source] });
  assert.deepEqual(source, before);
  assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(result.items));
  assert.ok(Object.isFrozen(result.items[0].provenance));
});

test("building and rendering never mutates external or policy state", () => {
  const mutations = 0;
  const result = view();
  renderToStaticMarkup(<LearningInboxV1 view={result} />);
  assert.equal(mutations, 0);
  assert.equal("policy_update" in result, false);
  assert.equal("external_mutation" in result, false);
});
