import type {
  ContentBriefV1,
  MediaAssetRecordV1,
  MediaPositioningDashboardCardV1,
  MediaPositioningFixtureBundleV1,
  MediaPositioningOpportunityV1,
  MediaProofPointV1,
  RecommendationClassV1,
  RightsStatusV1
} from "./contracts";
import { getMediaPositioningFixtureBundleV1 } from "./fixtures";

const RIGHTS_ORDER: RightsStatusV1[] = ["CLEARED", "REVIEW_REQUIRED", "UNKNOWN", "RESTRICTED"];

function mostRestrictiveRights(statuses: RightsStatusV1[]): RightsStatusV1 {
  if (!statuses.length) return "UNKNOWN";
  return statuses.reduce((current, next) =>
    RIGHTS_ORDER.indexOf(next) > RIGHTS_ORDER.indexOf(current) ? next : current
  );
}

function assetsForOpportunity(
  opportunity: MediaPositioningOpportunityV1,
  assets: MediaAssetRecordV1[]
) {
  return assets.filter((asset) =>
    asset.proof_point_refs.some((ref) => opportunity.proof_point_refs.includes(ref))
  );
}

export function classifyMediaPositioningRecommendationV1(input: {
  opportunity: MediaPositioningOpportunityV1;
  assets: MediaAssetRecordV1[];
}): RecommendationClassV1 {
  const assets = assetsForOpportunity(input.opportunity, input.assets);
  const hasHeroOrStrongAsset = assets.some((asset) => ["HERO", "STRONG"].includes(asset.quality));
  const hasUsableAsset = assets.some((asset) => ["HERO", "STRONG", "USABLE"].includes(asset.quality));
  const rightsStatus = mostRestrictiveRights(assets.map((asset) => asset.rights_status));
  const needsIndexing = assets.some((asset) => asset.archive_status !== "INDEXED_FIXTURE" || asset.rights_status === "UNKNOWN");

  if (!assets.length && input.opportunity.cultural_window) return "EVENT_CAPTURE";
  if (rightsStatus === "RESTRICTED" || rightsStatus === "UNKNOWN" || (needsIndexing && !hasUsableAsset)) return "DO_NOT_PUBLISH_YET";
  if (input.opportunity.cultural_window) return "EVENT_CAPTURE";
  if (hasHeroOrStrongAsset && rightsStatus === "CLEARED") return "ARCHIVE_REPURPOSE";
  if (hasHeroOrStrongAsset) return "NEW_VOICEOVER";
  if (hasUsableAsset) return "NEW_ON_CAMERA";
  return "NEW_PREMIUM_CAPTURE";
}

export function generateContentBriefFromOpportunityV1(input: {
  opportunity: MediaPositioningOpportunityV1;
  proofPoints: MediaProofPointV1[];
  assets: MediaAssetRecordV1[];
}): ContentBriefV1 {
  const assets = assetsForOpportunity(input.opportunity, input.assets);
  const proofPoints = input.proofPoints.filter((proof) => input.opportunity.proof_point_refs.includes(proof.proof_point_id));
  const recommendation = classifyMediaPositioningRecommendationV1({ opportunity: input.opportunity, assets: input.assets });
  const rightsStatus = mostRestrictiveRights(assets.map((asset) => asset.rights_status));
  const needsVerification = assets.some((asset) => asset.rights_status === "UNKNOWN" || asset.archive_status !== "INDEXED_FIXTURE");
  const missingCapture = recommendation === "EVENT_CAPTURE"
    ? ["permission-aware event capture", "post-event context notes", "approved relationship proof"]
    : needsVerification
      ? ["archive indexing pass", "rights and relationship verification"]
      : recommendation === "NEW_VOICEOVER"
        ? ["30-45 second studio voiceover"]
        : [];

  return {
    contract_version: "media_positioning_v1.0",
    brief_id: `brief-generated-${input.opportunity.opportunity_id}`,
    opportunity_ref: input.opportunity.opportunity_id,
    recommendation,
    hook: input.opportunity.narrative,
    thesis: input.opportunity.positioning_objective,
    proof_asset_refs: assets.map((asset) => asset.asset_id),
    missing_capture: missingCapture,
    story_arc: [
      "Open with the strongest visual proof.",
      "Explain the cultural pattern without over-claiming relationships.",
      "Return to craftsmanship as the credibility mechanism.",
      "Close with the positioning objective."
    ],
    shot_list: assets.flatMap((asset) => asset.reusable_excerpt_notes).slice(0, 5),
    edit_instructions: [
      "Keep pacing restrained and premium.",
      "Avoid repetitive name-dropping.",
      "Use exact endorsement-safe wording from proof points."
    ],
    caption_or_cta_intent: "Attract serious collectors, cultural operators, and relationship paths without chasing generic reach.",
    distribution_format: recommendation === "DO_NOT_PUBLISH_YET" ? "RELATIONSHIP_FOLLOW_UP_ASSET" : "REEL",
    positioning_objective: input.opportunity.positioning_objective,
    rights_status: rightsStatus,
    production_burden: recommendation === "EVENT_CAPTURE"
      ? "HUMAN_SHOOTER_REQUIRED"
      : recommendation === "DO_NOT_PUBLISH_YET"
        ? "HUMAN_EDITOR_REQUIRED"
        : "MEDIUM",
    approval_required: true,
    do_not_publish_reason: recommendation === "DO_NOT_PUBLISH_YET"
      ? "Rights, identity, or archive indexing gaps must be resolved before publication."
      : null,
    ai_value_add: ["archive retrieval", "story clustering", "script generation", "edit blueprint", "caption draft", "gap analysis"],
    human_requirements: recommendation === "EVENT_CAPTURE"
      ? ["skilled shooter/editor", "permission-aware capture", "human relationship judgment"]
      : ["final public wording approval", "rights review"],
    endorsement_guardrails: proofPoints.map((proof) => proof.endorsement_safeguard)
  };
}

export function toMediaPositioningDashboardCardsV1(
  bundle: MediaPositioningFixtureBundleV1 = getMediaPositioningFixtureBundleV1()
): MediaPositioningDashboardCardV1[] {
  return bundle.briefs.map((brief) => {
    const opportunity = bundle.opportunities.find((item) => item.opportunity_id === brief.opportunity_ref);
    const proof = bundle.proof_points
      .filter((item) => opportunity?.proof_point_refs.includes(item.proof_point_id))
      .map((item) => `${item.label} (${item.endorsement_status})`);
    const assetTitles = bundle.assets
      .filter((asset) => brief.proof_asset_refs.includes(asset.asset_id))
      .map((asset) => asset.title);
    return {
      card_version: "media_positioning_dashboard_card_v1.0",
      opportunity_id: brief.opportunity_ref,
      why_now: opportunity?.why_now ?? "No opportunity context available.",
      narrative: opportunity?.narrative ?? brief.thesis,
      proof,
      assets_available: assetTitles,
      assets_missing: brief.missing_capture,
      rights_status: brief.rights_status,
      recommended_format: brief.distribution_format,
      recommendation: brief.recommendation,
      production_burden: brief.production_burden,
      positioning_value: opportunity?.expected_positioning_value ?? "MEDIUM",
      next_action: brief.do_not_publish_reason ?? brief.edit_instructions[0] ?? "Prepare brief for approval.",
      approval: "REQUIRED_BEFORE_PUBLIC_POSTING"
    };
  });
}
