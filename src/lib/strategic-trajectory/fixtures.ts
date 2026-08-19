import { moneyRange, timeRange, unknownMoneyRange, type ConfidenceV1 } from "@/lib/financial-intelligence/contracts";
import {
  STRATEGIC_TRAJECTORY_CONTRACT_VERSION_V1,
  type StrategicTrajectoryNewFactV1,
  type StrategicTrajectoryPathV1,
  type StrategicTrajectorySnapshotV1
} from "./contracts";
import { applyStrategicTrajectoryNewFactV1 } from "./view-model";

const evidenceRefs = [
  { ref_id: "trajectory-fixture-strategy", source: "fixture" as const, notes: "Synthetic strategic trajectory fixture for deterministic dashboard tests." },
  { ref_id: "trajectory-fixture-capacity", source: "fixture" as const, notes: "Synthetic capacity and sequencing evidence." },
  { ref_id: "trajectory-fixture-scouting", source: "fixture" as const, notes: "Synthetic scouting fact for path revision." }
];

const confidence: ConfidenceV1 = {
  level: "MEDIUM",
  reasons: ["fixture_has_target_state_paths_bottleneck_and_scouting_action"],
  qualifiers: ["Direct economics remain UNKNOWN where not evidenced; prestige and network effects are qualitative."]
};

export const STRATEGIC_TRAJECTORY_NEW_FACT_FIXTURE_V1: StrategicTrajectoryNewFactV1 = {
  fact_id: "fact-warm-institutional-introduction-confirmed",
  summary: "A credible warm route into an institutional sports-culture curator is confirmed.",
  evidence_refs: ["trajectory-fixture-scouting"],
  changes_preferred_path_to: "path-institutional-prestige-wedge",
  revision_reason: "Confirmed institutional access lowers the access bottleneck enough to prefer the prestige wedge over the collector-room proof path."
};

export const STRATEGIC_TRAJECTORY_BASE_FIXTURE_V1: StrategicTrajectorySnapshotV1 = {
  contract_version: STRATEGIC_TRAJECTORY_CONTRACT_VERSION_V1,
  trajectory_id: "trajectory-premium-sports-art-authority-v1",
  as_of: "2026-08-19",
  source: "fixture",
  TARGET_STATE: "Keegan is positioned as the scarce, museum-level graphite artist for culturally iconic sports subjects.",
  CURRENT_STATE: "Craft authority is strong, but elite distribution, institutional proof, and repeatable collector access are still partial.",
  REQUIRED_ASSETS: [
    {
      asset_id: "asset-controlled-scarcity-system",
      label: "Controlled scarcity system",
      present_state: "PARTIAL",
      why_it_matters: "Premium positioning depends on disciplined availability and clear edition boundaries.",
      evidence_refs: ["trajectory-fixture-strategy"]
    },
    {
      asset_id: "asset-elite-access-path",
      label: "Elite access path",
      present_state: "UNKNOWN",
      why_it_matters: "Prestige strategy needs decision-maker access, not public attention alone.",
      evidence_refs: ["trajectory-fixture-scouting"]
    },
    {
      asset_id: "asset-signature-sports-proof",
      label: "Signature sports proof piece",
      present_state: "PARTIAL",
      why_it_matters: "A flagship subject can make the positioning inspectable instead of abstract.",
      evidence_refs: ["trajectory-fixture-strategy"]
    }
  ],
  BOTTLENECK: "Verified access to elite buyers or institutional tastemakers.",
  PATHS: ([
    {
      path_id: "path-collector-room-proof",
      label: "Private collector-room proof",
      status: "PREFERRED",
      strategy: "Use a tightly controlled private showing concept to validate premium collector intent before larger public signaling.",
      prerequisites: ["Shortlist 8-12 serious collector or advisor contacts", "Define one scarcity-safe viewing offer", "Prepare proof assets without discount language"],
      expected_tradeoffs: [
        { kind: "LEARNING", summary: "Buys direct signal before committing broader positioning energy.", qualitative_only: true },
        { kind: "CAPACITY", summary: "Uses bounded studio and strategy time.", qualitative_only: false }
      ],
      direct_financial_range: unknownMoneyRange(["trajectory-fixture-strategy"]),
      creative_hours_range: timeRange({ low_hours: 8, high_hours: 14, coverage_state: "PARTIAL", evidence_refs: ["trajectory-fixture-capacity"] }),
      downside: { level: "LOW", bounded: true, notes: ["Private and reversible if signal is weak."] },
      prestige_effect: { level: "MEDIUM", notes: "Prestige improves if the room is curated, but institutional lift is still unproven.", qualitative_only: true },
      network_effect: { level: "MEDIUM", notes: "Can reveal serious collectors and advisors, but does not automatically create institutional access.", qualitative_only: true },
      why_preferred_or_not: "Preferred while institutional access is UNKNOWN because it creates proprietary demand evidence with bounded downside.",
      evidence_refs: ["trajectory-fixture-strategy", "trajectory-fixture-capacity"]
    },
    {
      path_id: "path-institutional-prestige-wedge",
      label: "Institutional prestige wedge",
      status: "SCOUT",
      strategy: "Build a focused institutional sports-culture proposal only if a credible warm access route exists.",
      prerequisites: ["Confirm warm route to curator/sponsor decision-maker", "Map one culturally durable subject", "Keep economics UNKNOWN until counterpart interest is real"],
      expected_tradeoffs: [
        { kind: "PRESTIGE", summary: "Potentially stronger authority signal than a private collector proof.", qualitative_only: true },
        { kind: "NETWORK", summary: "Could compound elite relationship access.", qualitative_only: true },
        { kind: "CAPACITY", summary: "Consumes more narrative and proposal design capacity.", qualitative_only: false }
      ],
      direct_financial_range: unknownMoneyRange(["trajectory-fixture-scouting"]),
      creative_hours_range: timeRange({ low_hours: 16, high_hours: 26, coverage_state: "PARTIAL", evidence_refs: ["trajectory-fixture-capacity"] }),
      downside: { level: "MEDIUM", bounded: true, notes: ["Wasted preparation time if access is not real.", "No public brand damage if kept private."] },
      prestige_effect: { level: "HIGH", notes: "Institutional context could reinforce rarity without fake revenue precision.", qualitative_only: true },
      network_effect: { level: "HIGH", notes: "Warm sponsor/curator access can create future non-linear options.", qualitative_only: true },
      why_preferred_or_not: "Not preferred yet because access is the bottleneck and remains UNKNOWN.",
      evidence_refs: ["trajectory-fixture-scouting", "trajectory-fixture-capacity"]
    },
    {
      path_id: "path-public-volume-drop",
      label: "Public volume drop",
      status: "REJECTED",
      strategy: "Launch a broad low-friction public edition campaign.",
      prerequisites: ["Large audience push", "Fulfillment capacity", "Accessibility-first messaging"],
      expected_tradeoffs: [
        { kind: "CASH", summary: "Could create near-term transaction volume.", qualitative_only: false },
        { kind: "SCARCITY", summary: "Weakens rarity and premium positioning.", qualitative_only: true }
      ],
      direct_financial_range: moneyRange({ low_cents: 0, high_cents: 2500000, coverage_state: "UNKNOWN", evidence_refs: ["trajectory-fixture-strategy"] }),
      creative_hours_range: timeRange({ low_hours: 40, high_hours: 70, coverage_state: "PARTIAL", evidence_refs: ["trajectory-fixture-capacity"] }),
      downside: { level: "UNBOUNDED", bounded: false, notes: ["Brand dilution and scarcity damage cannot be bounded from fixture evidence."] },
      prestige_effect: { level: "LOW", notes: "Accessibility framing conflicts with premium scarcity.", qualitative_only: true },
      network_effect: { level: "LOW", notes: "Broad attention is not elite access.", qualitative_only: true },
      why_preferred_or_not: "Rejected because unbounded brand-positioning downside cannot become preferred.",
      evidence_refs: ["trajectory-fixture-strategy"]
    }
  ] satisfies StrategicTrajectoryPathV1[]).sort((a, b) => a.path_id.localeCompare(b.path_id)),
  NEXT_HIGH_LEVERAGE_MOVE: "Run the private collector-room proof while scouting one warm institutional access route.",
  COMPOUNDING_ASSET_CREATED: "A reusable map of credible premium access routes and scarcity-safe proof assets.",
  FOG_OF_WAR: [
    "UNKNOWN whether institutional access is real enough to justify proposal capacity.",
    "UNKNOWN direct dollars for prestige/network paths; qualitative value is not monetized."
  ],
  SCOUTING_ACTION: "Ask one trusted relationship for a specific curator/sponsor route and qualify whether they can reach a decision-maker.",
  WHAT_TO_IGNORE: ["Follower-count applause", "Low-ticket volume drop pressure", "Public discount mechanics"],
  REVISION_TRIGGER: "Revise preferred path only when a new fact verifies elite institutional access or disproves private collector intent.",
  PATH_REVISION_HISTORY: [],
  evidence_refs: evidenceRefs,
  confidence
};

export const STRATEGIC_TRAJECTORY_REVISED_FIXTURE_V1 = applyStrategicTrajectoryNewFactV1(
  STRATEGIC_TRAJECTORY_BASE_FIXTURE_V1,
  STRATEGIC_TRAJECTORY_NEW_FACT_FIXTURE_V1
);

export const STRATEGIC_TRAJECTORY_FIXTURES_V1 = [
  STRATEGIC_TRAJECTORY_BASE_FIXTURE_V1,
  STRATEGIC_TRAJECTORY_REVISED_FIXTURE_V1
].sort((a, b) => `${a.trajectory_id}:${a.PATH_REVISION_HISTORY.length}`.localeCompare(`${b.trajectory_id}:${b.PATH_REVISION_HISTORY.length}`));
