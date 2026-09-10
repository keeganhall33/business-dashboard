import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { ExecutiveLearningWorkspaceV1 } from "@/components/learning/ExecutiveLearningWorkspaceV1";
import { buildExecutiveLearningWorkspaceV1 } from "@/lib/learning/executive-learning-v1";

const learningPageSource = readFileSync(
  new URL("../../src/app/(app)/learning/page.tsx", import.meta.url),
  "utf8"
);

test("production Learning route consumes only the canonical production loader", () => {
  assert.doesNotMatch(learningPageSource, /ExecutiveWorkspacePage|getExecutiveWorkspaceByHrefV1/);
  assert.match(learningPageSource, /loadProductionLearningRecordsV1/);
  assert.match(learningPageSource, /feed\.status === "AVAILABLE" \? feed\.records : null/);
  assert.doesNotMatch(learningPageSource, /decisionLearningFixtures|FIXTURE_BASELINE|records:\s*\[\s*\{/);
  assert.match(learningPageSource, /IMPLEMENTED_NEEDS_OUTCOME/);
  assert.match(learningPageSource, /never changes policy without separate governed evidence/);
});

test("unavailable canonical evidence still fails closed", () => {
  const model = buildExecutiveLearningWorkspaceV1({ records: null });
  assert.equal(model.coverage, "UNAVAILABLE");
  assert.equal(model.summary.recordCount, null);
  assert.deepEqual(model.records, []);

  const html = renderToStaticMarkup(<ExecutiveLearningWorkspaceV1 model={model} />);
  assert.match(html, /Canonical learning evidence is not connected yet/);
  assert.match(html, /No synthetic records substituted/);
  assert.match(html, /Unavailable/);
});

test("known supplied evidence keeps prediction, outcome, attribution, lesson, and calibration distinct", () => {
  const model = buildExecutiveLearningWorkspaceV1({
    records: [{
      id: "pricing-test-1",
      hypothesis: "A clearer offer will improve qualified checkout starts.",
      prediction: "Checkout-start rate should improve during the evaluation window.",
      confidence: "MODERATE",
      evaluationWindow: "2026-09-01 through 2026-09-14",
      actionStatus: "TAKEN",
      observedOutcome: "Checkout-start rate increased in the measured comparison.",
      attributionConfidence: "MODERATE",
      lesson: "The observed change is consistent with the hypothesis within the measured window.",
      calibrationError: "Within stated qualitative range",
      evidenceState: "KNOWN"
    }]
  });

  assert.equal(model.coverage, "AVAILABLE");
  assert.deepEqual(model.summary, {
    recordCount: 1,
    pendingCount: 0,
    outcomeRecordedCount: 0,
    learningRecordedCount: 1,
    verificationRequiredCount: 0
  });
  assert.equal(model.records[0]?.evaluationState, "LEARNING_RECORDED");
  assert.equal(model.records[0]?.verificationRequired, false);

  const html = renderToStaticMarkup(<ExecutiveLearningWorkspaceV1 model={model} />);
  assert.match(html, /A clearer offer will improve qualified checkout starts/);
  assert.match(html, /Checkout-start rate increased/);
  assert.match(html, /Attribution confidence/);
  assert.match(html, /Calibration error/);
});

test("an observed outcome without attribution does not become completed learning", () => {
  const model = buildExecutiveLearningWorkspaceV1({
    records: [{
      id: "outcome-only",
      hypothesis: "A change may improve conversion.",
      prediction: "Conversion may rise.",
      evaluationWindow: "14 days",
      actionStatus: "TAKEN",
      observedOutcome: "Conversion rose during the period.",
      attributionConfidence: null,
      lesson: "Do not claim causation yet.",
      evidenceState: "KNOWN"
    }]
  });

  assert.equal(model.records[0]?.evaluationState, "OUTCOME_RECORDED");
  assert.equal(model.summary.learningRecordedCount, 0);
  assert.equal(model.summary.outcomeRecordedCount, 1);

  const html = renderToStaticMarkup(<ExecutiveLearningWorkspaceV1 model={model} />);
  assert.match(html, /does not infer causation from outcome alone/);
});

test("uncertain evidence remains verification-gated even when an outcome and lesson are supplied", () => {
  for (const evidenceState of ["UNKNOWN", "STALE", "CONFLICTED"] as const) {
    const model = buildExecutiveLearningWorkspaceV1({
      records: [{
        id: `uncertain-${evidenceState.toLowerCase()}`,
        hypothesis: "Candidate hypothesis",
        prediction: "Candidate prediction",
        actionStatus: "TAKEN",
        observedOutcome: "Candidate outcome",
        attributionConfidence: "HIGH",
        lesson: "Candidate lesson",
        evidenceState
      }]
    });

    assert.equal(model.records[0]?.verificationRequired, true);
    assert.equal(model.records[0]?.evaluationState, "OUTCOME_RECORDED");
    assert.equal(model.summary.verificationRequiredCount, 1);
  }
});

test("pending and known-empty feeds remain distinguishable from unavailable production coverage", () => {
  const pending = buildExecutiveLearningWorkspaceV1({
    records: [{
      id: "pending-1",
      prediction: "Measure after the window closes.",
      evaluationWindow: "2026-10-01",
      actionStatus: "PENDING",
      evidenceState: "KNOWN"
    }]
  });
  assert.equal(pending.records[0]?.evaluationState, "PENDING");
  assert.equal(pending.summary.pendingCount, 1);

  const knownEmpty = buildExecutiveLearningWorkspaceV1({ records: [] });
  assert.equal(knownEmpty.coverage, "AVAILABLE");
  assert.equal(knownEmpty.summary.recordCount, 0);
  assert.match(knownEmpty.coverageReason, /currently contains no records/);
});

test("projection rejects duplicate or missing learning identities", () => {
  assert.throws(
    () => buildExecutiveLearningWorkspaceV1({ records: [{ id: " " }] }),
    /requires id/
  );
  assert.throws(
    () => buildExecutiveLearningWorkspaceV1({
      records: [{ id: "same" }, { id: "same" }]
    }),
    /duplicate learning record id/
  );
});
