import assert from "node:assert/strict";
import test from "node:test";

import {
  compileSocialPlatformRoleEvidenceReviewV1,
  type SocialPlatformRoleV1
} from "@/lib/social-intelligence/social-platform-role-evidence-review-v1";
import type {
  SocialContentBusinessValueReviewItemV1,
  SocialContentBusinessValueReviewV1
} from "@/lib/social-intelligence/social-content-business-value-review-v1";

const AT = "2026-09-19T12:00:00.000Z";

function item(overrides: Partial<SocialContentBusinessValueReviewItemV1> & Pick<SocialContentBusinessValueReviewItemV1, "contentId">): SocialContentBusinessValueReviewItemV1 {
  const platform = overrides.platform ?? "INSTAGRAM";
  return {
    contentRef: `${platform}:${overrides.contentId}`,
    platform,
    accountId: overrides.accountId ?? "acct-1",
    contentId: overrides.contentId,
    signals: overrides.signals ?? [],
    businessValueState: overrides.businessValueState ?? "NOT_ESTABLISHED",
    reachState: overrides.reachState ?? "UNASSESSED",
    engagementState: overrides.engagementState ?? "UNASSESSED",
    linkedOutcomeCount: overrides.linkedOutcomeCount ?? 0,
    directTrackedOutcomeCount: overrides.directTrackedOutcomeCount ?? 0,
    outcomeCounts: overrides.outcomeCounts ?? null,
    highIntentMetrics: overrides.highIntentMetrics ?? [],
    outperformingEngagementMetrics: overrides.outperformingEngagementMetrics ?? [],
    reachMetricsReviewed: overrides.reachMetricsReviewed ?? [],
    performanceEvidenceRefs: overrides.performanceEvidenceRefs ?? [`evidence:performance:${overrides.contentId}`],
    outcomeEvidenceRefs: overrides.outcomeEvidenceRefs ?? [],
    interpretation: overrides.interpretation ?? "Observed evidence only.",
    causalClaim: false,
    revenueAttributionClaim: false,
    monetaryValue: null,
    competitorPerformanceClaim: false,
    endorsementClaim: false,
    recommendationAuthority: "NONE",
    providerWriteAuthority: "NONE",
    notificationAuthority: "NONE"
  };
}

function review(items: readonly SocialContentBusinessValueReviewItemV1[], status: SocialContentBusinessValueReviewV1["status"] = "READY", evaluatedAt = AT): SocialContentBusinessValueReviewV1 {
  const evidenceRefs = [...new Set(items.flatMap((entry) => [...entry.performanceEvidenceRefs, ...entry.outcomeEvidenceRefs]))].sort();
  return {
    contractVersion: "SocialContentBusinessValueReviewV1",
    evaluatedAt,
    status,
    items,
    lowerReachHighIntent: [],
    vanityRiskReview: [],
    trackedBusinessSignal: items.filter((entry) => entry.businessValueState === "TRACKED_BUSINESS_SIGNAL"),
    evidenceRefs,
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

function role(result: ReturnType<typeof compileSocialPlatformRoleEvidenceReviewV1>, name: SocialPlatformRoleV1, platform = "INSTAGRAM", accountId = "acct-1") {
  const account = result.accounts.find((entry) => entry.platform === platform && entry.accountId === accountId);
  assert.ok(account, `expected ${platform}/${accountId}`);
  const found = account.roles.find((entry) => entry.role === name);
  assert.ok(found, `expected role ${name}`);
  return found;
}

test("surfaces repeated account-scoped discovery and traffic evidence without cross-platform ranking", () => {
  const result = compileSocialPlatformRoleEvidenceReviewV1({
    businessValueReview: review([
      item({
        contentId: "ig-1",
        reachState: "HIGHER_THAN_COMPARABLE",
        reachMetricsReviewed: ["REACH"],
        highIntentMetrics: ["LINK_CLICKS"]
      }),
      item({
        contentId: "ig-2",
        reachState: "HIGHER_THAN_COMPARABLE",
        reachMetricsReviewed: ["VIEWS"],
        highIntentMetrics: ["LINK_CLICKS"]
      }),
      item({
        platform: "YOUTUBE",
        accountId: "yt-1",
        contentId: "yt-1",
        reachState: "HIGHER_THAN_COMPARABLE",
        reachMetricsReviewed: ["VIEWS"]
      })
    ]),
    evaluatedAt: AT,
    maxReviewAgeHours: 6,
    minimumDistinctContentPerRole: 2
  });

  assert.equal(result.status, "READY");
  assert.equal(role(result, "DISCOVERY").state, "EVIDENCE_CANDIDATE");
  assert.equal(role(result, "DISCOVERY").distinctContentCount, 2);
  assert.equal(role(result, "TRAFFIC").state, "EVIDENCE_CANDIDATE");
  assert.equal(role(result, "DISCOVERY", "YOUTUBE", "yt-1").state, "NOT_ESTABLISHED");
  assert.equal(result.crossPlatformRankingAuthority, "NONE");
  assert.equal(result.confidenceClaim, false);
  assert.equal(result.causalClaim, false);
  assert.equal(result.monetaryValue, null);
  assert.equal(result.recommendationAuthority, "NONE");
  assert.equal(result.providerWriteAuthority, "NONE");
});

test("keeps downstream business roles evidence-bounded and requires repeated distinct content", () => {
  const counts = {
    SITE_SESSION: 0,
    EMAIL_SIGNUP: 0,
    INQUIRY: 1,
    PURCHASE: 1,
    OPPORTUNITY: 0,
    MEDIA_OUTCOME: 1
  } as const;

  const result = compileSocialPlatformRoleEvidenceReviewV1({
    businessValueReview: review([
      item({
        contentId: "tracked-1",
        businessValueState: "TRACKED_BUSINESS_SIGNAL",
        linkedOutcomeCount: 3,
        directTrackedOutcomeCount: 2,
        outcomeCounts: counts,
        outcomeEvidenceRefs: ["evidence:outcome:1"]
      }),
      item({
        contentId: "tracked-2",
        businessValueState: "TRACKED_BUSINESS_SIGNAL",
        linkedOutcomeCount: 3,
        directTrackedOutcomeCount: 1,
        outcomeCounts: counts,
        outcomeEvidenceRefs: ["evidence:outcome:2"]
      })
    ]),
    evaluatedAt: AT,
    maxReviewAgeHours: 6,
    minimumDistinctContentPerRole: 2
  });

  assert.equal(role(result, "BUSINESS_DEVELOPMENT").state, "EVIDENCE_CANDIDATE");
  assert.equal(role(result, "COMMERCE").state, "EVIDENCE_CANDIDATE");
  assert.equal(role(result, "MEDIA_AUTHORITY").state, "EVIDENCE_CANDIDATE");
  assert.equal(role(result, "COMMERCE").directTrackedContentCount, 2);
  assert.deepEqual(role(result, "COMMERCE").evidenceRefs, ["evidence:outcome:1", "evidence:outcome:2"]);
});

test("does not invent prestige, collector-intent, or long-form-authority roles from generic social evidence", () => {
  const result = compileSocialPlatformRoleEvidenceReviewV1({
    businessValueReview: review([
      item({
        contentId: "viral-1",
        reachState: "HIGHER_THAN_COMPARABLE",
        engagementState: "OUTPERFORMING",
        outperformingEngagementMetrics: ["COMMENTS", "SHARES", "SAVES"]
      }),
      item({
        contentId: "viral-2",
        reachState: "HIGHER_THAN_COMPARABLE",
        engagementState: "OUTPERFORMING",
        outperformingEngagementMetrics: ["COMMENTS", "SHARES", "SAVES"]
      })
    ]),
    evaluatedAt: AT,
    maxReviewAgeHours: 6,
    minimumDistinctContentPerRole: 2
  });

  const roleNames = result.accounts.flatMap((account) => account.roles.map((entry) => entry.role));
  assert.ok(!roleNames.includes("PRESTIGE" as SocialPlatformRoleV1));
  assert.ok(!roleNames.includes("COLLECTOR_INTENT" as SocialPlatformRoleV1));
  assert.ok(!roleNames.includes("LONG_FORM_AUTHORITY" as SocialPlatformRoleV1));
  assert.ok(result.limitations.some((limitation) => limitation.includes("Prestige, collector intent, and long-form authority are not inferred")));
});

test("fails closed when the upstream review is stale, future-dated, or requires verification", () => {
  const stale = compileSocialPlatformRoleEvidenceReviewV1({
    businessValueReview: review([item({ contentId: "old" })], "READY", "2026-09-18T00:00:00.000Z"),
    evaluatedAt: AT,
    maxReviewAgeHours: 6,
    minimumDistinctContentPerRole: 2
  });
  assert.equal(stale.status, "VERIFY_REQUIRED");
  assert.deepEqual(stale.accounts, []);

  const future = compileSocialPlatformRoleEvidenceReviewV1({
    businessValueReview: review([item({ contentId: "future" })], "READY", "2026-09-19T13:00:00.000Z"),
    evaluatedAt: AT,
    maxReviewAgeHours: 6,
    minimumDistinctContentPerRole: 2
  });
  assert.equal(future.status, "VERIFY_REQUIRED");

  const verify = compileSocialPlatformRoleEvidenceReviewV1({
    businessValueReview: review([], "VERIFY_REQUIRED"),
    evaluatedAt: AT,
    maxReviewAgeHours: 6,
    minimumDistinctContentPerRole: 2
  });
  assert.equal(verify.status, "VERIFY_REQUIRED");
});

test("rejects tampered identity and authority widening", () => {
  const badIdentity = item({ contentId: "bad-id" });
  assert.throws(() => compileSocialPlatformRoleEvidenceReviewV1({
    businessValueReview: review([{ ...badIdentity, contentRef: "INSTAGRAM:not-the-content" }]),
    evaluatedAt: AT,
    maxReviewAgeHours: 6,
    minimumDistinctContentPerRole: 2
  }), /content identity drift/);

  const widened = review([item({ contentId: "write" })]);
  assert.throws(() => compileSocialPlatformRoleEvidenceReviewV1({
    businessValueReview: { ...widened, providerWriteAuthority: "WRITE" as never },
    evaluatedAt: AT,
    maxReviewAgeHours: 6,
    minimumDistinctContentPerRole: 2
  }), /widens interpretation or action authority/);
});

test("returns frozen deterministic output and preserves not-established rather than zero-confidence claims", () => {
  const input = {
    businessValueReview: review([item({ contentId: "one", highIntentMetrics: ["PROFILE_VISITS"] })]),
    evaluatedAt: AT,
    maxReviewAgeHours: 6,
    minimumDistinctContentPerRole: 2
  } as const;
  const first = compileSocialPlatformRoleEvidenceReviewV1(input);
  const second = compileSocialPlatformRoleEvidenceReviewV1(input);

  assert.deepEqual(first, second);
  assert.ok(Object.isFrozen(first));
  assert.ok(Object.isFrozen(first.accounts[0]));
  assert.equal(role(first, "DISCOVERY").state, "NOT_ESTABLISHED");
  assert.equal(first.attributionClaim, false);
  assert.equal(first.confidenceClaim, false);
  assert.equal(first.writesPerformed, false);
});
