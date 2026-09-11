import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import React from "react";
import { renderToString } from "react-dom/server";

import { DecisionRoom } from "@/components/intelligence-ux/DecisionRoom";
import type { DecisionRoomStrategicContextV1 } from "@/lib/decision-room/contracts";
import { DECISION_ROOM_FIXTURE_V1 } from "@/lib/decision-room/fixtures";
import {
  buildDecisionRoomStrategicContextV1,
  withDecisionRoomStrategicContextV1
} from "@/lib/decision-room/trajectory-data-context";

const CANONICAL_UNKNOWN_CONTEXT: DecisionRoomStrategicContextV1 = {
  trajectory: {
    trajectory_id: "canonical-trajectory-unknown",
    target_state: "UNKNOWN until canonical trajectory evidence is available.",
    preferred_path: {
      path_id: "unknown-path",
      label: "No supported preferred path",
      why_preferred: "UNKNOWN: no canonical comparison is available."
    },
    current_bottleneck: "UNKNOWN",
    next_high_leverage_move: "Acquire canonical trajectory evidence.",
    what_to_ignore: [],
    fog_of_war: ["UNKNOWN trajectory and access evidence."],
    scouting_action: "Collect verified evidence before recommending a path."
  },
  acquisition: {
    map_id: "canonical-acquisition-unknown",
    decision_or_capability: "Decision Room strategic context",
    coverage_state: "UNKNOWN",
    source_health: "UNKNOWN",
    freshness: "UNKNOWN",
    approval_class: "NO_APPROVAL_NEEDED",
    critical_gap: null,
    next_best_acquisition_action: {
      action_id: "collect-canonical-context",
      label: "Collect verified trajectory and acquisition evidence",
      safety: "READ_ONLY",
      rationale: "No strategic context is presented without canonical input."
    },
    conflicts: []
  }
};

test("production trajectory adapter has no fixture provider import", () => {
  const source = readFileSync(
    resolve(process.cwd(), "src/lib/decision-room/trajectory-data-context.ts"),
    "utf8"
  );

  assert.doesNotMatch(source, /(?:data-acquisition|strategic-trajectory)\/fixtures/);
});

test("Decision Room strategic context uses only explicit canonical input without reranking", () => {
  const decision = withDecisionRoomStrategicContextV1(
    DECISION_ROOM_FIXTURE_V1,
    CANONICAL_UNKNOWN_CONTEXT
  );
  const context = decision.strategic_context;

  assert.ok(context);
  assert.equal(
    decision.current_recommendation.recommendation_id,
    DECISION_ROOM_FIXTURE_V1.current_recommendation.recommendation_id
  );
  assert.equal(decision.next_action, DECISION_ROOM_FIXTURE_V1.next_action);
  assert.deepEqual(context, CANONICAL_UNKNOWN_CONTEXT);
  assert.notEqual(context, CANONICAL_UNKNOWN_CONTEXT);
  assert.notEqual(context.trajectory, CANONICAL_UNKNOWN_CONTEXT.trajectory);
  assert.notEqual(context.acquisition, CANONICAL_UNKNOWN_CONTEXT.acquisition);
});

test("missing canonical input removes strategic context instead of manufacturing claims", () => {
  const seeded = {
    ...DECISION_ROOM_FIXTURE_V1,
    strategic_context: CANONICAL_UNKNOWN_CONTEXT
  };
  const decision = withDecisionRoomStrategicContextV1(seeded);

  assert.equal(buildDecisionRoomStrategicContextV1(), undefined);
  assert.equal(decision.strategic_context, undefined);
});

test("explicit UNKNOWN canonical context remains visible in Decision Room", () => {
  const decision = withDecisionRoomStrategicContextV1(
    DECISION_ROOM_FIXTURE_V1,
    CANONICAL_UNKNOWN_CONTEXT
  );
  const html = renderToString(<DecisionRoom decision={decision} />);

  assert.match(html, /Trajectory and acquisition context/);
  assert.match(html, /No supported preferred path/);
  assert.match(html, /UNKNOWN trajectory and access evidence/);
  assert.match(html, /Collect verified trajectory and acquisition evidence/);
  assert.doesNotMatch(html, /Follower-count applause|private collector-room proof/i);
});
