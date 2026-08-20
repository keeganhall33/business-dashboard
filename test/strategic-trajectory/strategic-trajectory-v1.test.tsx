import assert from "node:assert/strict";
import test from "node:test";

import { pathHasUnboundedDownside, type StrategicTrajectoryNewFactV1 } from "@/lib/strategic-trajectory/contracts";
import {
  STRATEGIC_TRAJECTORY_BASE_FIXTURE_V1,
  STRATEGIC_TRAJECTORY_NEW_FACT_FIXTURE_V1,
  STRATEGIC_TRAJECTORY_REVISED_FIXTURE_V1
} from "@/lib/strategic-trajectory/fixtures";
import { applyStrategicTrajectoryNewFactV1, toStrategicTrajectoryViewModelV1 } from "@/lib/strategic-trajectory/view-model";

test("base strategic trajectory exposes target state, bottleneck, paths, fog, scouting, and ignore lane", () => {
  const view = toStrategicTrajectoryViewModelV1(STRATEGIC_TRAJECTORY_BASE_FIXTURE_V1);

  assert.equal(view.view_version, "strategic_trajectory_view_v1.0");
  assert.match(view.target_state, /museum-level graphite artist/);
  assert.match(view.current_bottleneck, /Verified access/);
  assert.equal(view.preferred_path.path_id, "path-collector-room-proof");
  assert.equal(view.viable_paths.length, 2);
  assert.ok(view.required_assets.some((asset) => asset.present_state === "UNKNOWN"));
  assert.match(view.opportunity_cost.summary, /uses bounded strategy\/studio time/);
  assert.equal(view.critical_unknown.unknown_id, "unknown-institutional-access-route");
  assert.equal(view.critical_unknown.scouting_action, view.scouting_action);
  assert.match(view.fog_of_war.join(" "), /UNKNOWN/);
  assert.match(view.scouting_action, /decision-maker/);
  assert.deepEqual(view.what_to_ignore, ["Follower-count applause", "Low-ticket volume drop pressure", "Public discount mechanics"]);
  assert.equal(view.ignore_or_deprioritize[0]?.label, "Public volume drop pressure");
  assert.match(view.ignore_or_deprioritize[0]?.rationale ?? "", /scarcity/);
  assert.match(view.ignore_or_deprioritize[0]?.reconsideration_trigger ?? "", /tightly controlled/);
  assert.equal(view.keegan_action_required, "NO");
});

test("path switching is triggered by a new fact and preserves the previous path reason", () => {
  const revised = applyStrategicTrajectoryNewFactV1(
    STRATEGIC_TRAJECTORY_BASE_FIXTURE_V1,
    STRATEGIC_TRAJECTORY_NEW_FACT_FIXTURE_V1
  );
  const view = toStrategicTrajectoryViewModelV1(revised);

  assert.equal(view.preferred_path.path_id, "path-institutional-prestige-wedge");
  assert.equal(view.path_revision_history.length, 1);
  assert.equal(view.path_revision_history[0]?.previous_preferred_path_id, "path-collector-room-proof");
  assert.equal(view.path_revision_history[0]?.new_preferred_path_id, "path-institutional-prestige-wedge");
  assert.equal(view.path_revision_history[0]?.trigger_fact_id, STRATEGIC_TRAJECTORY_NEW_FACT_FIXTURE_V1.fact_id);
  assert.match(view.path_revision_history[0]?.previous_reason ?? "", /institutional access is UNKNOWN/);
  assert.match(view.path_revision_history[0]?.revision_reason ?? "", /Confirmed institutional access/);
  assert.match(view.next_high_leverage_move, /Act on revised path/);
});

test("new fact fixture is deterministic and materially changes the preferred path", () => {
  const baseView = toStrategicTrajectoryViewModelV1(STRATEGIC_TRAJECTORY_BASE_FIXTURE_V1);
  const revisedView = toStrategicTrajectoryViewModelV1(STRATEGIC_TRAJECTORY_REVISED_FIXTURE_V1);

  assert.equal(baseView.preferred_path.path_id, "path-collector-room-proof");
  assert.equal(revisedView.preferred_path.path_id, "path-institutional-prestige-wedge");
  assert.notEqual(baseView.preferred_path.strategy, revisedView.preferred_path.strategy);
  assert.equal(JSON.stringify(STRATEGIC_TRAJECTORY_REVISED_FIXTURE_V1), JSON.stringify(applyStrategicTrajectoryNewFactV1(STRATEGIC_TRAJECTORY_BASE_FIXTURE_V1, STRATEGIC_TRAJECTORY_NEW_FACT_FIXTURE_V1)));
});

test("distraction suppression remains explicit and is not collapsed into generic priority text", () => {
  const view = toStrategicTrajectoryViewModelV1(STRATEGIC_TRAJECTORY_BASE_FIXTURE_V1);

  assert.ok(view.what_to_ignore.includes("Follower-count applause"));
  assert.ok(view.what_to_ignore.includes("Low-ticket volume drop pressure"));
  assert.ok(view.what_to_ignore.includes("Public discount mechanics"));
  assert.ok(view.ignore_or_deprioritize.some((item) => item.item_id === "ignore-public-volume-drop"));
  assert.ok(view.ignore_or_deprioritize.every((item) => item.rationale.length > 0 && item.reconsideration_trigger.length > 0));
  assert.doesNotMatch(view.next_high_leverage_move, /follower|discount|volume drop/i);
});

test("paths are alternatives rather than deterministic destiny language", () => {
  const view = toStrategicTrajectoryViewModelV1(STRATEGIC_TRAJECTORY_BASE_FIXTURE_V1);

  assert.ok(view.viable_paths.length >= 2);
  assert.ok(view.viable_paths.every((path) => !/destined|inevitable|guaranteed|certain/i.test(`${path.strategy} ${path.why_preferred_or_not}`)));
  assert.match(view.next_high_leverage_move, /Run the private collector-room proof/);
});

test("unbounded downside cannot become the preferred path", () => {
  const rejectedPath = STRATEGIC_TRAJECTORY_BASE_FIXTURE_V1.PATHS.find((path) => path.path_id === "path-public-volume-drop");
  assert.ok(rejectedPath);
  assert.equal(pathHasUnboundedDownside(rejectedPath), true);

  const badFact: StrategicTrajectoryNewFactV1 = {
    fact_id: "fact-vanity-demand-spike",
    summary: "A vanity demand spike appears without bounded downside evidence.",
    evidence_refs: ["trajectory-fixture-strategy"],
    changes_preferred_path_to: "path-public-volume-drop",
    revision_reason: "This should be rejected because downside remains unbounded."
  };

  assert.throws(
    () => applyStrategicTrajectoryNewFactV1(STRATEGIC_TRAJECTORY_BASE_FIXTURE_V1, badFact),
    /cannot make unbounded downside path/
  );
});
