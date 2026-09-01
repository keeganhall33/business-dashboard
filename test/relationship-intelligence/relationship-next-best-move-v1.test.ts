import assert from "node:assert/strict";
import test from "node:test";

import { buildRelationshipNextBestMoveViewModelV1 } from "@/lib/relationship-intelligence/next-best-move/adapter";
import {
  RELATIONSHIP_NEXT_BEST_MOVE_TARGET_FIXTURES_V1,
  RELATIONSHIP_NEXT_BEST_MOVE_VIEW_MODEL_FIXTURE_V1
} from "@/lib/relationship-intelligence/next-best-move/fixtures";

test("next-best-move view exposes warm path and freshness when known", () => {
  const warm = RELATIONSHIP_NEXT_BEST_MOVE_VIEW_MODEL_FIXTURE_V1.targets.find((target) => target.target_id === "crm-collector-warm-path-avery");

  assert.ok(warm);
  assert.equal(warm.relationship_state, "KNOWN");
  assert.equal(warm.warm_path.introducer_name, "Avery Morgan");
  assert.equal(warm.warm_path.evidence_state, "KNOWN");
  assert.equal(warm.last_meaningful_interaction.freshness, "FRESH");
  assert.match(warm.next_best_move, /internal value brief/i);
  assert.equal(warm.active_ask_or_commitment.summary, "No active ask; prepare value framing only.");
  assert.equal(warm.timing_window.label, "THIS_WEEK_INTERNAL_PREP");
});

test("stale relationship remains explicit and does not invent a timing window", () => {
  const stale = RELATIONSHIP_NEXT_BEST_MOVE_VIEW_MODEL_FIXTURE_V1.targets.find((target) => target.target_id === "crm-media-stale-boardroom");

  assert.ok(stale);
  assert.equal(stale.relationship_state, "STALE");
  assert.equal(stale.last_meaningful_interaction.freshness, "STALE");
  assert.equal(stale.timing_window.label, null);
  assert.equal(stale.timing_window.evidence_state, "STALE");
  assert.match(stale.next_best_move, /refresh the relationship context privately/i);
  assert.equal(stale.dashboard_flags.unknown_stale_conflicted_explicit, true);
});

test("unknown-access target preserves UNKNOWN without fake scores or probabilities", () => {
  const unknown = RELATIONSHIP_NEXT_BEST_MOVE_VIEW_MODEL_FIXTURE_V1.targets.find((target) => target.target_id === "crm-brand-unknown-access-fanatics");
  const narrative = [
    unknown?.relationship_state_detail,
    unknown?.warm_path.label,
    unknown?.last_meaningful_interaction.label,
    unknown?.why_relationship_matters,
    unknown?.next_best_move,
    unknown?.timing_window.rationale,
    unknown?.key_unknown_or_blocker,
    ...(unknown?.what_would_change_the_recommendation ?? [])
  ].join(" ").toLowerCase();

  assert.ok(unknown);
  assert.equal(unknown.relationship_state, "UNKNOWN");
  assert.equal(unknown.warm_path.introducer_name, null);
  assert.equal(unknown.warm_path.evidence_state, "UNKNOWN");
  assert.equal(unknown.last_meaningful_interaction.happened_at, null);
  assert.equal(unknown.timing_window.label, null);
  assert.equal(unknown.dashboard_flags.no_contact_strength_score, true);
  assert.equal(unknown.dashboard_flags.no_access_probability, true);
  assert.doesNotMatch(narrative, /score|probability|likely to respond|contact strength/);
});

test("strategy engine packet is compact and dashboard-consumable", () => {
  const view = RELATIONSHIP_NEXT_BEST_MOVE_VIEW_MODEL_FIXTURE_V1;

  assert.equal(view.view_version, "relationship_next_best_move_view_v1.0");
  assert.equal(view.source_mode, "DETERMINISTIC_FIXTURE");
  assert.equal(view.targets.length, 3);
  assert.equal(view.strategy_engine_packet.target_count, 3);
  assert.equal(view.strategy_engine_packet.ready_for_internal_planning_count, 1);
  assert.equal(view.strategy_engine_packet.blocked_or_unknown_count, 2);
  assert.equal(view.strategy_engine_packet.next_moves.length, 3);
  assert.equal(view.dashboard_flags.crm_workspace_consumable, true);
  assert.equal(view.dashboard_flags.strategy_engine_consumable, true);
  assert.equal(view.dashboard_flags.keegan_action_required, "NO");
});

test("adapter replay is deterministic and performs no outreach or writes", () => {
  const replay = buildRelationshipNextBestMoveViewModelV1({
    targets: RELATIONSHIP_NEXT_BEST_MOVE_TARGET_FIXTURES_V1
  });

  assert.deepEqual(replay, RELATIONSHIP_NEXT_BEST_MOVE_VIEW_MODEL_FIXTURE_V1);
  assert.equal(replay.dashboard_flags.no_external_action, true);
  assert.ok(replay.targets.every((target) => target.dashboard_flags.no_outreach_performed));
  assert.ok(replay.targets.every((target) => target.dashboard_flags.no_private_account_connection));
  assert.ok(replay.targets.every((target) => target.dashboard_flags.no_durable_write));
});
