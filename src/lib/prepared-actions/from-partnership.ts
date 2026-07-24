import { createPreparedAction } from "@/lib/supabase/queries";
import type {
  PartnershipOpportunity,
  PartnershipOpportunitySnapshot,
  PreparedAction,
  PreparedActionAsset,
  PreparedActionEvidence
} from "@/lib/types/dashboard";

const ACTIVE_STATUSES = new Set(["draft", "ready_for_review", "approved"]);

type Summary = {
  created: number;
  skippedDuplicate: number;
  message?: string;
};

export async function ensurePreparedActionFromPartnershipSnapshot(
  snapshot: PartnershipOpportunitySnapshot | null,
  existing: PreparedAction[]
): Promise<Summary> {
  const items = snapshot?.items?.filter((item) => item.status !== "sample") ?? [];
  if (!items.length) {
    return { created: 0, skippedDuplicate: 0, message: "No active partnership opportunities." };
  }

  const opportunity = selectBestOpportunity(items);
  if (!opportunity) {
    return { created: 0, skippedDuplicate: 0, message: "No qualifying partnership opportunity." };
  }

  const dedupeKey = `noah:opportunity:${opportunity.id}`;
  const hasDuplicate = existing.some(
    (action) => action.dedupeKey === dedupeKey && ACTIVE_STATUSES.has(action.status)
  );
  if (hasDuplicate) {
    return { created: 0, skippedDuplicate: 1, message: "Noah prepared action already staged." };
  }

  const evidence: PreparedActionEvidence[] = [
    { label: "Why now", value: opportunity.whyNow },
    { label: "Keegan angle", value: opportunity.keeganAngle }
  ];
  if (opportunity.sourceUrl) {
    evidence.push({ label: "Source", value: opportunity.sourceUrl });
  } else if (opportunity.sourceName) {
    evidence.push({ label: "Source", value: opportunity.sourceName });
  }

  const asset: PreparedActionAsset = {
    label: "Partnership brief",
    value: [
      `Headline: ${opportunity.headline}`,
      `Concept: ${opportunity.recommendedArtworkOrConcept ?? "Refine concept"}`,
      `Pitch angle: ${opportunity.suggestedPitchAngle ?? "Highlight prestige placements"}`,
      `Next move: ${opportunity.nextManualAction}`
    ].join("\n")
  };

  const riskLevel = opportunity.urgency === "high" ? "high" : "medium";

  await createPreparedAction({
    title: `Prep ${opportunity.headline}`,
    category: "partnership",
    sourcePanel: "partnership_feed",
    sourceSnapshotAt: snapshot?.generatedAt ?? null,
    sourceUrl: opportunity.sourceUrl ?? null,
    dedupeKey,
    whyItMatters: opportunity.whyItMatters,
    evidence,
    preparedAsset: [asset],
    riskLevel,
    confidence: opportunity.confidence,
    dataLight: false,
    requiredApprovalAction: `Approve Noah's partnership pitch prep for ${opportunity.headline}.`,
    createdByAgent: "noah"
  });

  return { created: 1, skippedDuplicate: 0 };
}

function selectBestOpportunity(items: PartnershipOpportunity[]) {
  return [...items].sort((a, b) => score(b) - score(a))[0];
}

function score(item: PartnershipOpportunity) {
  const urgencyScore = item.urgency === "high" ? 3 : item.urgency === "medium" ? 2 : 1;
  const confidenceScore = item.confidence === "high" ? 3 : item.confidence === "medium" ? 2 : 1;
  const recency = new Date(item.observedAt).getTime();
  return urgencyScore * 10 + confidenceScore * 5 + recency / 1e11;
}
