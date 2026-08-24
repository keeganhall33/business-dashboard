import { STRATEGIC_ADVANTAGE_ASSESSMENT_FIXTURES_V1 } from "@/lib/strategic-advantage/fixtures";
import { STRATEGIC_TRAJECTORY_BASE_FIXTURE_V1, STRATEGIC_TRAJECTORY_REVISED_FIXTURE_V1 } from "@/lib/strategic-trajectory/fixtures";
import { toStrategicTrajectoryViewModelV1 } from "@/lib/strategic-trajectory/view-model";
import { buildStrategicAdvantageDecisionLensV1 } from "./adapter";

const baseTrajectory = toStrategicTrajectoryViewModelV1(STRATEGIC_TRAJECTORY_BASE_FIXTURE_V1);
const revisedTrajectory = toStrategicTrajectoryViewModelV1(STRATEGIC_TRAJECTORY_REVISED_FIXTURE_V1);

function assessment(id: string) {
  const item = STRATEGIC_ADVANTAGE_ASSESSMENT_FIXTURES_V1.find((candidate) => candidate.assessment_id === id);
  if (!item) throw new Error(`Missing strategic advantage fixture ${id}`);
  return item;
}

export const STRATEGIC_ADVANTAGE_DECISION_LENS_FIXTURES_V1 = [
  buildStrategicAdvantageDecisionLensV1({
    assessment: assessment("advantage-high-upside-reversible-learning-option"),
    trajectory: baseTrajectory
  }),
  buildStrategicAdvantageDecisionLensV1({
    assessment: assessment("advantage-prestige-network-uncertain-economics"),
    trajectory: baseTrajectory
  }),
  buildStrategicAdvantageDecisionLensV1({
    assessment: assessment("advantage-reject-risk-of-ruin-capacity-conflict"),
    trajectory: baseTrajectory
  }),
  buildStrategicAdvantageDecisionLensV1({
    assessment: assessment("advantage-prestige-network-uncertain-economics"),
    trajectory: revisedTrajectory
  })
].sort((a, b) => `${a.assessment_id}:${a.revision.history.length}`.localeCompare(`${b.assessment_id}:${b.revision.history.length}`));
