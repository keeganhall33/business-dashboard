import assert from "node:assert/strict";
import test from "node:test";

import { evaluateRetrievalQualityV1, type RetrievalQualityEvalInputV1 } from "@/lib/intelligence-quality-evals/retrieval-quality-v1";

const evaluatedAt = "2026-09-13T20:00:00.000Z";

function passingInput(): RetrievalQualityEvalInputV1 {
  return {
    run_id: "retrieval-eval:release-candidate",
    evaluated_at: evaluatedAt,
    expectations: [
      { case_id: "known-right", kind: "KNOWN", required_evidence_refs: ["evidence:rights-current"], forbidden_evidence_refs: [], expected_answer_state: "KNOWN" },
      { case_id: "conflicted-metric", kind: "CONFLICTED", required_evidence_refs: ["evidence:metric-a", "evidence:metric-b"], forbidden_evidence_refs: [], expected_answer_state: "CONFLICTED" },
      { case_id: "superseded-contact", kind: "SUPERSEDED", required_evidence_refs: ["evidence:contact-current"], forbidden_evidence_refs: ["evidence:contact-old"], expected_answer_state: "KNOWN" },
      { case_id: "unknown-budget", kind: "UNKNOWN", required_evidence_refs: [], forbidden_evidence_refs: [], expected_answer_state: "UNKNOWN" }
    ],
    observations: [
      { case_id: "known-right", retrieved_evidence_refs: ["evidence:rights-current"], cited_evidence_refs: ["evidence:rights-current"], answer_state: "KNOWN", latency_ms: 10, cost_usd: 0.01 },
      { case_id: "conflicted-metric", retrieved_evidence_refs: ["evidence:metric-a", "evidence:metric-b"], cited_evidence_refs: ["evidence:metric-a", "evidence:metric-b"], answer_state: "CONFLICTED", latency_ms: 20, cost_usd: 0.02 },
      { case_id: "superseded-contact", retrieved_evidence_refs: ["evidence:contact-current", "evidence:contact-old"], cited_evidence_refs: ["evidence:contact-current"], answer_state: "KNOWN", latency_ms: 30, cost_usd: 0.03 },
      { case_id: "unknown-budget", retrieved_evidence_refs: [], cited_evidence_refs: [], answer_state: "UNKNOWN", latency_ms: 5, cost_usd: 0 }
    ]
  };
}

test("scores retrieval, citations, conflicts, supersession, and UNKNOWN abstention exactly", () => {
  const result = evaluateRetrievalQualityV1(passingInput());

  assert.equal(result.contract_version, "RETRIEVAL_QUALITY_EVAL_V1");
  assert.equal(result.state, "PASS");
  assert.equal(result.metrics.source_recall, 1);
  assert.equal(result.metrics.citation_precision, 1);
  assert.equal(result.metrics.conflict_recall, 1);
  assert.equal(result.metrics.supersession_accuracy, 1);
  assert.equal(result.metrics.unknown_abstention_accuracy, 1);
  assert.equal(result.metrics.observed_latency_ms, 65);
  assert.equal(result.metrics.observed_cost_usd, 0.06);
  assert.equal(result.metrics.latency_coverage, "KNOWN");
  assert.equal(result.metrics.cost_coverage, "KNOWN");
});

test("fails when a conflict is flattened or superseded evidence is cited", () => {
  const baseline = passingInput();
  const input: RetrievalQualityEvalInputV1 = { ...baseline, observations: baseline.observations.map((item) => {
    if (item.case_id === "conflicted-metric") return { ...item, retrieved_evidence_refs: ["evidence:metric-a"], cited_evidence_refs: ["evidence:metric-a"], answer_state: "KNOWN" as const };
    if (item.case_id === "superseded-contact") return { ...item, cited_evidence_refs: ["evidence:contact-old"] };
    return item;
  }) };

  const result = evaluateRetrievalQualityV1(input);
  const conflict = result.cases.find((item) => item.case_id === "conflicted-metric");
  const superseded = result.cases.find((item) => item.case_id === "superseded-contact");
  assert.equal(result.state, "FAIL");
  assert.ok(conflict?.reason_codes.includes("CONFLICT_NOT_PRESERVED"));
  assert.ok(superseded?.reason_codes.includes("FORBIDDEN_SUPERSEDED_EVIDENCE_CITED"));
});

test("missing observations remain UNKNOWN instead of becoming a pass", () => {
  const baseline = passingInput();
  const input: RetrievalQualityEvalInputV1 = {
    ...baseline,
    observations: baseline.observations.filter((item) => item.case_id !== "unknown-budget")
  };
  const result = evaluateRetrievalQualityV1(input);

  assert.equal(result.state, "UNKNOWN");
  assert.equal(result.cases.find((item) => item.case_id === "unknown-budget")?.state, "UNKNOWN");
  assert.equal(result.metrics.unknown_abstention_accuracy, null);
  assert.equal(result.metrics.latency_coverage, "KNOWN");
});

test("fails when required evidence is retrieved but omitted from citations", () => {
  const baseline = passingInput();
  const input: RetrievalQualityEvalInputV1 = {
    ...baseline,
    observations: baseline.observations.map((item) => item.case_id === "known-right"
      ? { ...item, cited_evidence_refs: [] }
      : item)
  };
  const result = evaluateRetrievalQualityV1(input);

  assert.equal(result.state, "FAIL");
  assert.ok(result.cases.find((item) => item.case_id === "known-right")?.reason_codes.includes("REQUIRED_CITATION_MISSED"));
});

test("unknown answers cannot cite evidence and partial telemetry stays explicit", () => {
  const baseline = passingInput();
  const input: RetrievalQualityEvalInputV1 = {
    ...baseline,
    observations: baseline.observations.map((item) => item.case_id === "unknown-budget"
      ? { ...item, cited_evidence_refs: ["evidence:invented"], answer_state: "KNOWN" as const, latency_ms: null, cost_usd: null }
      : item)
  };
  const result = evaluateRetrievalQualityV1(input);

  assert.equal(result.state, "FAIL");
  assert.ok(result.cases.find((item) => item.case_id === "unknown-budget")?.reason_codes.includes("UNKNOWN_NOT_ABSTAINED"));
  assert.equal(result.metrics.latency_coverage, "INCOMPLETE");
  assert.equal(result.metrics.cost_coverage, "INCOMPLETE");
});

test("malformed eval corpora fail closed", () => {
  const overlapping: RetrievalQualityEvalInputV1 = {
    ...passingInput(),
    expectations: [{
      case_id: "bad",
      kind: "SUPERSEDED",
      required_evidence_refs: ["evidence:same"],
      forbidden_evidence_refs: ["evidence:same"],
      expected_answer_state: "KNOWN"
    }],
    observations: []
  };

  assert.throws(() => evaluateRetrievalQualityV1(overlapping), /EVIDENCE_REF_OVERLAP/);
  assert.throws(() => evaluateRetrievalQualityV1({ ...passingInput(), observations: [{
    case_id: "not-in-corpus",
    retrieved_evidence_refs: [],
    cited_evidence_refs: [],
    answer_state: "UNKNOWN",
    latency_ms: null,
    cost_usd: null
  }] }), /OBSERVATION_CASE_UNKNOWN/);
});
