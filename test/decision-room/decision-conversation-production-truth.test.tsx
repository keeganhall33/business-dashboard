import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { buildDecisionConversationPanelViewModelV1 } from "@/components/intelligence/conversation/DecisionConversationViewModel";
import { toDecisionRoomViewModelV1 } from "@/lib/decision-room/shell-adapter";
import { INTELLIGENCE_UX_SHELL_FIXTURE_V1 } from "@/lib/intelligence-ux/responsive-shell-fixtures";

const adapterSources = [
  "src/lib/decision-room/shell-adapter.ts",
  "src/components/intelligence/conversation/DecisionConversationViewModel.ts"
].map((path) => readFileSync(path, "utf8"));

test("production decision and conversation adapters do not import fixture providers", () => {
  for (const source of adapterSources) {
    assert.doesNotMatch(source, /from\s+["'][^"']*\/fixtures["']/);
  }
});

test("legacy decision input and missing conversation input fail closed", () => {
  const legacyDecision = INTELLIGENCE_UX_SHELL_FIXTURE_V1.decision_rooms[0];
  const decision = toDecisionRoomViewModelV1(legacyDecision);
  const conversation = buildDecisionConversationPanelViewModelV1();

  assert.equal(decision.confidence, "insufficient_evidence");
  assert.equal(decision.approval_class, "L0_INSIGHT");
  assert.equal(decision.evidence_refs[0]?.truth_state, "UNKNOWN");
  assert.equal(conversation.read_only_state, "UNAVAILABLE");
  assert.equal(conversation.mutation_state, "MUTATION_DISABLED");
  assert.equal(conversation.input.read_only_fixture, false);
  assert.deepEqual(conversation.suggested_questions, []);
  assert.deepEqual(conversation.answer.unknowns, ["Canonical decision evidence"]);
  assert.equal(conversation.answer.facts_mutated, false);
});
