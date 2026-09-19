import assert from "node:assert/strict";
import test from "node:test";

import { compileSocialPlatformRoleEvidenceReviewV1 } from "@/lib/social-intelligence/social-platform-role-evidence-review-v1";
import type { SocialContentBusinessValueReviewV1 } from "@/lib/social-intelligence/social-content-business-value-review-v1";

const AT = "2026-09-19T12:00:00.000Z";

function likesOnlyReview(): SocialContentBusinessValueReviewV1 {
  const items = ["one", "two"].map((id) => ({
    contentRef: `INSTAGRAM:${id}`,
    platform: "INSTAGRAM" as const,
    accountId: "acct-1",
    contentId: id,
    signals: [],
    businessValueState: "NOT_ESTABLISHED" as const,
    reachState: "UNASSESSED" as const,
    engagementState: "OUTPERFORMING" as const,
    linkedOutcomeCount: 0,
    directTrackedOutcomeCount: 0,
    outcomeCounts: null,
    highIntentMetrics: [],
    outperformingEngagementMetrics: ["LIKES" as const],
    reachMetricsReviewed: [],
    performanceEvidenceRefs: [`evidence:likes:${id}`],
    outcomeEvidenceRefs: [],
    interpretation: "Likes outperformed the comparable cohort; no community interaction claim is established.",
    causalClaim: false as const,
    revenueAttributionClaim: false as const,
    monetaryValue: null,
    competitorPerformanceClaim: false as const,
    endorsementClaim: false as const,
    recommendationAuthority: "NONE" as const,
    providerWriteAuthority: "NONE" as const,
    notificationAuthority: "NONE" as const
  }));

  return {
    contractVersion: "SocialContentBusinessValueReviewV1",
    evaluatedAt: AT,
    status: "READY",
    items,
    lowerReachHighIntent: [],
    vanityRiskReview: [],
    trackedBusinessSignal: [],
    evidenceRefs: items.flatMap((item) => item.performanceEvidenceRefs),
    limitations: [],
    causalClaim: false,
    revenueAttributionClaim: false,
    monetaryValue: null,
    competitorPerformanceClaim: false,
    endorsementClaim: false,
    recommendationAuthority: "NONE",
    providerWriteAuthority: "NONE",
    notificationAuthority: "NONE",
    externalAccessPerformed: false,
    writesPerformed: false
  };
}

test("likes-only outperformance does not establish a community role", () => {
  const result = compileSocialPlatformRoleEvidenceReviewV1({
    businessValueReview: likesOnlyReview(),
    evaluatedAt: AT,
    maxReviewAgeHours: 6,
    minimumDistinctContentPerRole: 2
  });

  const community = result.accounts[0]?.roles.find((role) => role.role === "COMMUNITY");
  assert.ok(community);
  assert.equal(community.state, "NOT_ESTABLISHED");
  assert.equal(community.distinctContentCount, 0);
  assert.deepEqual(community.evidenceRefs, []);
});
