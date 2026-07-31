import type { Recommendation, RecommendationDraftAsset, RecommendationCategory, ApprovalLevel } from "./recommendation-contract";

export function prepareDraftAssets(input: {
  recommendation: Recommendation;
  category: RecommendationCategory;
}): { nextApprovalLevel: ApprovalLevel; assets: RecommendationDraftAsset[] } {
  const assets: RecommendationDraftAsset[] = [];

  const draft = (id: string, label: string, kind: RecommendationDraftAsset["kind"], content: Record<string, unknown>) =>
    assets.push({ id, label, kind, content, watermark: "DRAFT_NOT_APPROVED" });

  if (input.category === "website") {
    draft("draft_website_homepage", "Homepage feature draft", "website", {
      page_url: "/",
      section: "hero",
      proposed_copy: "Draft copy (not approved)",
      cta: "Shop prints",
      rollout: "100% after approval",
      rollback_plan: "restore previous revision"
    });
  }

  if (input.category === "email") {
    draft("draft_email_campaign", "Email draft (not approved)", "email", {
      segment: "TBD (requires connected email platform)",
      subject_lines: ["Draft subject A", "Draft subject B"],
      preview_text: "Draft preview text",
      body: "Draft body",
      send_time: "TBD",
      utm_plan: "utm_source=email&utm_medium=email&utm_campaign=<slug>"
    });
  }

  if (input.category === "scale" || input.category === "pause" || input.category === "refresh" || input.category === "retarget") {
    draft("draft_meta_brief", "Meta creative + structure brief (not approved)", "meta", {
      objective: "TBD",
      audience: "TBD",
      budget_range_cents_per_day: [2000, 5000],
      creative_brief: {
        hooks: ["Draft hook 1", "Draft hook 2"],
        angles: ["craftsmanship", "scarcity", "cultural moment"],
        cta: "Shop"
      },
      success_threshold: "ROAS improves without CPC +10%",
      stop_rule: "Pause if spend rises and orders do not increase"
    });
  }

  const nextApprovalLevel: ApprovalLevel = assets.length ? "L2_DRAFT_PREPARED" : input.recommendation.approval_level;
  return { nextApprovalLevel, assets };
}
