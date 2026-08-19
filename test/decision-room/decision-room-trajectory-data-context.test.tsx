import assert from "node:assert/strict";
import test from "node:test";

import React from "react";
import { renderToString } from "react-dom/server";

import { DecisionRoom } from "@/components/intelligence-ux/DecisionRoom";
import { DECISION_ROOM_FIXTURE_V1 } from "@/lib/decision-room/fixtures";
import {
  buildDecisionRoomStrategicContextV1,
  withDecisionRoomStrategicContextV1
} from "@/lib/decision-room/trajectory-data-context";
import { EXECUTIVE_HOME_DECISION_ROOM_DRILLDOWN_FIXTURE_V1 } from "@/lib/executive-home/decision-room-drilldown";

test("Decision Room strategic context adapts trajectory and data acquisition fixtures without reranking", () => {
  const decision = withDecisionRoomStrategicContextV1(DECISION_ROOM_FIXTURE_V1);
  const context = decision.strategic_context;

  assert.ok(context);
  assert.equal(decision.current_recommendation.recommendation_id, DECISION_ROOM_FIXTURE_V1.current_recommendation.recommendation_id);
  assert.equal(decision.next_action, DECISION_ROOM_FIXTURE_V1.next_action);
  assert.equal(context.trajectory.preferred_path.path_id, "path-collector-room-proof");
  assert.match(context.trajectory.target_state, /museum-level graphite artist/);
  assert.match(context.trajectory.current_bottleneck, /Verified access/);
  assert.match(context.trajectory.next_high_leverage_move, /private collector-room proof/);
  assert.ok(context.trajectory.what_to_ignore.includes("Follower-count applause"));
  assert.ok(context.trajectory.fog_of_war.some((item) => item.includes("UNKNOWN")));
  assert.match(context.trajectory.scouting_action, /decision-maker/);
  assert.equal(context.acquisition.map_id, "coverage-missing-public-research");
  assert.equal(context.acquisition.coverage_state, "GAP");
  assert.equal(context.acquisition.source_health, "MISSING");
  assert.equal(context.acquisition.freshness, "UNKNOWN");
  assert.equal(context.acquisition.approval_class, "NO_APPROVAL_NEEDED");
  assert.equal(context.acquisition.critical_gap?.fact_id, "fact-institutional-program-fit");
  assert.equal(context.acquisition.critical_gap?.truth_state, "NEEDS_RESEARCH");
  assert.equal(context.acquisition.next_best_acquisition_action.safety, "SAFE_PUBLIC_RESEARCH");
});

test("Executive Home drilldown fixture carries trajectory and acquisition context into Decision Room", () => {
  const html = renderToString(<DecisionRoom decision={EXECUTIVE_HOME_DECISION_ROOM_DRILLDOWN_FIXTURE_V1} />);

  assert.match(html, /Trajectory and acquisition context/);
  assert.match(html, /Target \/ preferred path/);
  assert.match(html, /Private collector-room proof/);
  assert.match(html, /Bottleneck/);
  assert.match(html, /Verified access to elite buyers or institutional tastemakers/);
  assert.match(html, /What to ignore/);
  assert.match(html, /Follower-count applause/);
  assert.match(html, /Fog-of-war \/ scouting action/);
  assert.match(html, /UNKNOWN whether institutional access is real/);
  assert.match(html, /Coverage state/);
  assert.match(html, /GAP/);
  assert.match(html, /MISSING/);
  assert.match(html, /UNKNOWN/);
  assert.match(html, /NO_APPROVAL_NEEDED/);
  assert.match(html, /Critical gap/);
  assert.match(html, /fact-institutional-program-fit/);
  assert.match(html, /NEEDS_RESEARCH/);
  assert.match(html, /Next best acquisition action/);
  assert.match(html, /Review official public program pages and summarize fit\/no-fit evidence/);
  assert.match(html, /Ask Jeeves/);
});

test("Decision Room strategic context remains deterministic", () => {
  assert.deepEqual(buildDecisionRoomStrategicContextV1(), buildDecisionRoomStrategicContextV1());
});
