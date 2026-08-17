import { creativeDirectionRoadmapFixture } from "./fixtures";
import type { CreativeDirectionCandidate, CreativeDirectionRoadmap, CreativeDirectionStage, EvidenceUpdate } from "./contracts";

const stageRank: Record<CreativeDirectionStage, number> = {
  KEEP_NOW: 0,
  TEST_NOW: 1,
  DEVELOP_NEXT: 2,
  DEFER: 3,
  AVOID: 4
};

const confidencePenalty = {
  HIGH: 0,
  MEDIUM: 1,
  LOW: 2
} as const;

export function getCreativeDirectionRoadmap(): CreativeDirectionRoadmap {
  return creativeDirectionRoadmapFixture;
}

export function sortDirectionsByStage(candidates: CreativeDirectionCandidate[]): CreativeDirectionCandidate[] {
  return [...candidates].sort((left, right) => {
    const stageDelta = stageRank[left.STAGE] - stageRank[right.STAGE];
    if (stageDelta !== 0) return stageDelta;
    const confidenceDelta = confidencePenalty[left.CONFIDENCE] - confidencePenalty[right.CONFIDENCE];
    if (confidenceDelta !== 0) return confidenceDelta;
    return left.DIRECTION_ID.localeCompare(right.DIRECTION_ID);
  });
}

export function toDashboardConsumableRoadmap(roadmap: CreativeDirectionRoadmap = creativeDirectionRoadmapFixture) {
  const sorted = sortDirectionsByStage(roadmap.directions);
  return {
    generatedAt: roadmap.generatedAt,
    dataMode: roadmap.dataMode,
    question: roadmap.dashboard.question,
    currentRecommendation: roadmap.dashboard.currentRecommendation,
    stageOrder: roadmap.stageOrder,
    directions: sorted.map((direction) => ({
      directionId: direction.DIRECTION_ID,
      stage: direction.STAGE,
      medium: direction.MEDIUM,
      specificArtworkRecommendation: {
        materials: direction.MATERIALS,
        sizeScale: direction.SIZE_SCALE,
        subject: direction.SUBJECT_OR_NON_SUBJECT,
        composition: direction.COMPOSITION,
        paletteColorLogic: direction.PALETTE_COLOR_LOGIC,
        lighting: direction.LIGHTING,
        detailEdgeTreatment: direction.DETAIL_EDGE_TREATMENT,
        negativeSpace: direction.NEGATIVE_SPACE,
        figureAbstractionSurrealHybrid: direction.FIGURATION_ABSTRACTION_SURREAL_HYBRID,
        physicalDepthOrRelief: direction.PHYSICAL_DEPTH_OR_RELIEF,
        seriesStructure: direction.SERIES_STRUCTURE,
        displayInstallation: direction.DISPLAY_INSTALLATION
      },
      signals: {
        currentMarket: direction.CURRENT_MARKET_SIGNAL,
        longTermPrestige: direction.LONG_TERM_PRESTIGE_SIGNAL,
        evidenceIds: direction.evidenceIds
      },
      fit: {
        differentiation: direction.DIFFERENTIATION,
        brandFit: direction.KEEGAN_BRAND_FIT,
        shortPathValue: direction.SHORT_PATH_VALUE,
        compoundingAssetValue: direction.COMPOUNDING_ASSET_VALUE,
        brandConfusionRisk: direction.BRAND_CONFUSION_RISK
      },
      uncertainty: {
        confidence: direction.CONFIDENCE,
        criticalUnknowns: direction.CRITICAL_UNKNOWNS,
        whatWouldChangeRecommendation: direction.WHAT_WOULD_CHANGE_THE_RECOMMENDATION
      },
      nextProof: direction.SUCCESS_CRITERIA
    })),
    evidence: roadmap.evidence,
    caveats: roadmap.dashboard.caveats
  };
}

export function applyEvidenceUpdate(
  candidate: CreativeDirectionCandidate,
  update: EvidenceUpdate
): { candidate: CreativeDirectionCandidate; createdNewVersion: boolean; reason: string } {
  if (update.materiality === "NOISY") {
    return { candidate, createdNewVersion: false, reason: "Noisy evidence is recorded but does not churn the recommendation." };
  }

  if (update.materiality === "MISSING_REQUIRED") {
    return {
      candidate: {
        ...candidate,
        CONFIDENCE: candidate.CONFIDENCE === "HIGH" ? "MEDIUM" : "LOW",
        CRITICAL_UNKNOWNS: Array.from(new Set([...candidate.CRITICAL_UNKNOWNS, update.claimSummary])),
        decisionNotes: [...candidate.decisionNotes, "Missing evidence widened uncertainty without changing stage."]
      },
      createdNewVersion: true,
      reason: "Missing required evidence changes confidence and preserves uncertainty."
    };
  }

  return {
    candidate: {
      ...candidate,
      evidenceIds: Array.from(new Set([...candidate.evidenceIds, update.evidenceId])),
      decisionNotes: [...candidate.decisionNotes, `New material ${update.signalClass} evidence: ${update.claimSummary}`]
    },
    createdNewVersion: true,
    reason: "Material evidence creates a new recommendation version input."
  };
}
