import assert from "node:assert/strict";
import test from "node:test";

import { DECISION_EVIDENCE_GAP_FIXTURES_V1 } from "@/lib/decision-evidence/fixtures";
import { buildDecisionEvidenceDashboardFixturesV1, toDecisionEvidenceDashboardViewModelV1 } from "@/lib/decision-evidence/view-model";

function fixture(id: string) {
  const item = DECISION_EVIDENCE_GAP_FIXTURES_V1.find((gap) => gap.DECISION_ID === id);
  assert.ok(item, `missing fixture ${id}`);
  return item;
}

test("fixtures cover direct, material unknown, proxy-only, stale/conflicted, and low-value skip cases", () => {
  assert.deepEqual(
    DECISION_EVIDENCE_GAP_FIXTURES_V1.map((item) => item.DECISION_ID),
    [
      "decision-sufficient-direct-evidence",
      "decision-material-unknown-cheap-research",
      "decision-proxy-only-prestige",
      "decision-stale-conflicted-attribution",
      "decision-low-value-skip-research"
    ]
  );
  assert.ok(DECISION_EVIDENCE_GAP_FIXTURES_V1.every((item) => item.contract_version === "decision_evidence_gap_v1"));
});

test("material unknowns remain visible with cheapest credible next research action", () => {
  const gap = fixture("decision-material-unknown-cheap-research");
  const view = toDecisionEvidenceDashboardViewModelV1(gap);

  assert.equal(gap.COVERAGE_STATE, "GAP");
  assert.equal(gap.CRITICAL_UNKNOWN, "Whether a host or sponsor covers direct event cost.");
  assert.equal(gap.MATERIALITY_IF_RESOLVED, "DECISION_CHANGING");
  assert.equal(gap.COST_OR_EFFORT_CLASS, "LOW");
  assert.equal(view.recommendation, "RESEARCH_NOW");
  assert.equal(view.flags.material_unknown_visible, true);
  assert.match(view.next_best_action, /cheapest credible internal research/i);
  assert.match(view.change_trigger, /bounded validation/i);
});

test("proxy evidence never masquerades as direct evidence", () => {
  const gap = fixture("decision-proxy-only-prestige");
  const view = toDecisionEvidenceDashboardViewModelV1(gap);

  assert.deepEqual(gap.DIRECT_VS_PROXY_EVIDENCE.direct_ref_ids, []);
  assert.deepEqual(gap.DIRECT_VS_PROXY_EVIDENCE.proxy_or_analog_ref_ids, ["strategy-prepare-creative-direction"]);
  assert.equal(gap.DIRECT_VS_PROXY_EVIDENCE.proxy_masquerades_as_direct, false);
  assert.ok(gap.EVIDENCE_REFS.every((item) => item.directness !== "DIRECT"));
  assert.ok(view.evidence_rows.every((row) => row.badge !== "DIRECT"));
  assert.equal(view.flags.proxy_masquerades_as_direct, false);
  assert.equal(view.confidence_cap, "possible");
});

test("UNKNOWN STALE and CONFLICTED states survive dashboard view-model rendering", () => {
  const staleConflict = toDecisionEvidenceDashboardViewModelV1(fixture("decision-stale-conflicted-attribution"));
  const unknown = toDecisionEvidenceDashboardViewModelV1(fixture("decision-low-value-skip-research"));

  assert.equal(staleConflict.coverage_state, "CONFLICTED");
  assert.equal(staleConflict.flags.stale_or_conflicted_visible, true);
  assert.ok(staleConflict.evidence_rows.some((row) => row.state === "STALE"));
  assert.ok(staleConflict.evidence_rows.some((row) => row.state === "CONFLICTED"));
  assert.match(staleConflict.next_best_action, /Refresh GA4/);

  assert.equal(unknown.coverage_state, "UNKNOWN");
  assert.equal(unknown.evidence_rows[0].state, "UNKNOWN");
  assert.match(unknown.evidence_rows[0].detail, /UNKNOWN/);
});

test("low-value research is deprioritized deterministically", () => {
  const gap = fixture("decision-low-value-skip-research");
  const view = toDecisionEvidenceDashboardViewModelV1(gap);

  assert.equal(gap.ESTIMATED_INFORMATION_VALUE_QUALITATIVE, "LOW");
  assert.equal(gap.COST_OR_EFFORT_CLASS, "NOT_WORTH_IT");
  assert.equal(view.recommendation, "SKIP_FOR_NOW");
  assert.equal(view.flags.low_value_research_deprioritized, true);
  assert.match(view.stop_rule, /information value is low/i);
});

test("sufficient direct evidence maps to sufficient and does not invent a critical unknown", () => {
  const view = toDecisionEvidenceDashboardViewModelV1(fixture("decision-sufficient-direct-evidence"));

  assert.equal(view.recommendation, "SUFFICIENT");
  assert.equal(view.critical_unknowns.length, 0);
  assert.equal(view.flags.material_unknown_visible, false);
  assert.ok(view.evidence_rows.every((row) => row.badge === "DIRECT"));
});

test("dashboard fixture builder is deterministic and Decision Room consumable", () => {
  const views = buildDecisionEvidenceDashboardFixturesV1();

  assert.deepEqual(
    views.map((item) => item.decision_id),
    DECISION_EVIDENCE_GAP_FIXTURES_V1.map((item) => item.DECISION_ID)
  );
  assert.ok(views.every((item) => item.view_model_version === "decision_evidence_dashboard_v1"));
  assert.ok(views.every((item) => item.evidence_rows.length > 0));
  assert.ok(views.every((item) => item.next_best_action.length > 0));
});
