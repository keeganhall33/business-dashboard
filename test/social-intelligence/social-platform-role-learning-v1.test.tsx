import assert from "node:assert/strict";
import test from "node:test";

import { compileCanonicalSocialAccountSnapshotV1 } from "@/lib/social-intelligence/social-canonical-v1";
import { compileSocialBusinessOutcomeLinkageV1 } from "@/lib/social-intelligence/social-business-outcome-linkage-v1";
import {
  compileSocialPlatformRoleLearningV1,
  type SocialPlatformRoleLearningPolicyV1,
} from "@/lib/social-intelligence/social-platform-role-learning-v1";

const evaluatedAt = "2026-09-18T17:00:00.000Z";

const policy: SocialPlatformRoleLearningPolicyV1 = {
  maxSnapshotAgeHours: 24,
  maxOutcomeLinkageAgeHours: 24,
  minIndependentContentItems: 2,
  minLinkedBusinessOutcomes: 2,
};

function snapshot(options: {
  retrievedAt?: string;
  lastSuccessfulSyncAt?: string;
  accountId?: string;
  secretEvidence?: boolean;
  includeSecondContent?: boolean;
} = {}) {
  const secretRef = options.secretEvidence ? "op://vault/social/token" : "evidence:content:1";
  return compileCanonicalSocialAccountSnapshotV1({
    platform: "INSTAGRAM",
    accountId: options.accountId ?? "keegan-main",
    handle: "keeganhall",
    retrievedAt: options.retrievedAt ?? "2026-09-18T16:00:00.000Z",
    sourceCoverage: {
      requestedState: "CONNECTED_AND_INGESTING",
      lastSuccessfulSyncAt: options.lastSuccessfulSyncAt ?? "2026-09-18T16:00:00.000Z",
      metricCoverage: [
        "NET_NEW_AUDIENCE",
        "REACH",
        "LINK_CLICKS",
        "COMMENTS",
        "SHARES",
        "SAVES",
        "WATCH_TIME_SECONDS",
        "AVERAGE_VIEW_DURATION_SECONDS",
      ],
    },
    periods: [{
      periodId: "30d-current",
      window: "30D",
      startAt: "2026-08-19T00:00:00.000Z",
      endAt: "2026-09-18T00:00:00.000Z",
      metrics: {
        NET_NEW_AUDIENCE: { value: 120, evidenceRefs: ["evidence:audience-growth"] },
        REACH: { value: 42_000, evidenceRefs: ["evidence:reach"] },
      },
    }],
    content: [
      {
        contentId: "post-1",
        publishedAt: "2026-09-10T12:00:00.000Z",
        metrics: {
          LINK_CLICKS: { value: 40, evidenceRefs: [secretRef] },
          COMMENTS: { value: 30, evidenceRefs: ["evidence:comments:1"] },
          SHARES: { value: 12, evidenceRefs: ["evidence:shares:1"] },
          SAVES: { value: 18, evidenceRefs: ["evidence:saves:1"] },
          WATCH_TIME_SECONDS: { value: 7_200, evidenceRefs: ["evidence:watch:1"] },
          AVERAGE_VIEW_DURATION_SECONDS: { value: 31, evidenceRefs: ["evidence:avg-watch:1"] },
        },
      },
      ...(options.includeSecondContent === false ? [] : [{
        contentId: "post-2",
        publishedAt: "2026-09-12T12:00:00.000Z",
        metrics: {
          LINK_CLICKS: { value: 25, evidenceRefs: ["evidence:clicks:2"] },
          COMMENTS: { value: 15, evidenceRefs: ["evidence:comments:2"] },
          SHARES: { value: 8, evidenceRefs: ["evidence:shares:2"] },
          SAVES: { value: 10, evidenceRefs: ["evidence:saves:2"] },
          WATCH_TIME_SECONDS: { value: 5_400, evidenceRefs: ["evidence:watch:2"] },
          AVERAGE_VIEW_DURATION_SECONDS: { value: 28, evidenceRefs: ["evidence:avg-watch:2"] },
        },
      }]),
    ],
  }, evaluatedAt, 48);
}

function outcomeLinkage(sourceSnapshot = snapshot(), generatedAt = "2026-09-18T16:30:00.000Z") {
  return compileSocialBusinessOutcomeLinkageV1({
    generatedAt,
    socialSnapshots: [sourceSnapshot],
    outcomes: [
      {
        outcomeId: "purchase-1",
        kind: "PURCHASE",
        source: "COMMERCE",
        sourceRecordRef: "commerce:purchase-1",
        occurredAt: "2026-09-15T12:00:00.000Z",
        observedAt: "2026-09-18T16:00:00.000Z",
        truthState: "KNOWN",
        completeThroughAt: "2026-09-18T16:00:00.000Z",
        evidenceRefs: ["evidence:purchase-1"],
        socialContentRef: { platform: "INSTAGRAM", contentId: "post-1" },
        linkEvidence: {
          basis: "EXACT_TRACKING_REF",
          attributionRef: "utm:purchase-1",
          evidenceRefs: ["evidence:utm-purchase-1"],
        },
      },
      {
        outcomeId: "purchase-2",
        kind: "PURCHASE",
        source: "COMMERCE",
        sourceRecordRef: "commerce:purchase-2",
        occurredAt: "2026-09-16T12:00:00.000Z",
        observedAt: "2026-09-18T16:00:00.000Z",
        truthState: "KNOWN",
        completeThroughAt: "2026-09-18T16:00:00.000Z",
        evidenceRefs: ["evidence:purchase-2"],
        socialContentRef: { platform: "INSTAGRAM", contentId: "post-2" },
        linkEvidence: {
          basis: "EXACT_TRACKING_REF",
          attributionRef: "utm:purchase-2",
          evidenceRefs: ["evidence:utm-purchase-2"],
        },
      },
      {
        outcomeId: "opportunity-1",
        kind: "OPPORTUNITY",
        source: "CRM",
        sourceRecordRef: "crm:opportunity-1",
        occurredAt: "2026-09-17T12:00:00.000Z",
        observedAt: "2026-09-18T16:00:00.000Z",
        truthState: "KNOWN",
        completeThroughAt: "2026-09-18T16:00:00.000Z",
        evidenceRefs: ["evidence:opportunity-1"],
        socialContentRef: { platform: "INSTAGRAM", contentId: "post-1" },
        linkEvidence: {
          basis: "EXACT_CAMPAIGN_REF",
          attributionRef: "campaign:partner-1",
          evidenceRefs: ["evidence:campaign-partner-1"],
        },
      },
    ],
  });
}

function result(options: {
  sourceSnapshot?: ReturnType<typeof snapshot>;
  generatedAt?: string;
  policyOverrides?: Partial<SocialPlatformRoleLearningPolicyV1>;
} = {}) {
  const sourceSnapshot = options.sourceSnapshot ?? snapshot();
  return compileSocialPlatformRoleLearningV1({
    evaluatedAt,
    snapshots: [sourceSnapshot],
    outcomeLinkage: outcomeLinkage(sourceSnapshot, options.generatedAt),
    policy: { ...policy, ...options.policyOverrides },
  });
}

function role(resultValue: ReturnType<typeof result>, roleName: string) {
  return resultValue.profiles[0]!.roles.find((item) => item.role === roleName)!;
}

test("surfaces evidence-backed channel-role review candidates without choosing a best channel", () => {
  const compiled = result();

  assert.equal(role(compiled, "DISCOVERY").state, "SUPPORTED_FOR_ROLE_REVIEW");
  assert.equal(role(compiled, "TRAFFIC").state, "SUPPORTED_FOR_ROLE_REVIEW");
  assert.equal(role(compiled, "COMMUNITY").state, "SUPPORTED_FOR_ROLE_REVIEW");
  assert.equal(role(compiled, "LONG_FORM_AUTHORITY").state, "SUPPORTED_FOR_ROLE_REVIEW");
  assert.equal(role(compiled, "COLLECTOR_INTENT").state, "SUPPORTED_FOR_ROLE_REVIEW");
  assert.equal(role(compiled, "COLLECTOR_INTENT").directTrackedOutcomeCount, 2);
  assert.equal(role(compiled, "PARTNERSHIP").state, "OBSERVATION_ONLY");
  assert.equal(role(compiled, "PARTNERSHIP").supportedAssociationCount, 1);
  assert.equal(role(compiled, "MEDIA_PRESTIGE").state, "INSUFFICIENT_EVIDENCE");

  for (const item of compiled.profiles[0]!.roles) {
    assert.equal(item.bestChannelClaim, false);
    assert.equal(item.confidence, null);
    assert.equal(item.causalClaim, false);
    assert.equal(item.revenueAttributionClaim, false);
  }
  assert.equal(compiled.authority.crossPlatformWinnerSelectionAllowed, false);
  assert.equal(compiled.authority.publicPostingAllowed, false);
  assert.equal(compiled.authority.paidAmplificationAllowed, false);
});

test("keeps one positive content observation observational when the caller requires repeat evidence", () => {
  const sourceSnapshot = snapshot({ includeSecondContent: false });
  const compiled = compileSocialPlatformRoleLearningV1({
    evaluatedAt,
    snapshots: [sourceSnapshot],
    outcomeLinkage: compileSocialBusinessOutcomeLinkageV1({ generatedAt: "2026-09-18T16:30:00.000Z", socialSnapshots: [sourceSnapshot], outcomes: [] }),
    policy,
  });

  assert.equal(role(compiled, "TRAFFIC").state, "OBSERVATION_ONLY");
  assert.equal(role(compiled, "COMMUNITY").state, "OBSERVATION_ONLY");
  assert.equal(role(compiled, "LONG_FORM_AUTHORITY").state, "OBSERVATION_ONLY");
});

test("fails source-dependent roles closed when the social snapshot is stale", () => {
  const sourceSnapshot = snapshot({
    retrievedAt: "2026-09-16T12:00:00.000Z",
    lastSuccessfulSyncAt: "2026-09-16T12:00:00.000Z",
  });
  const compiled = compileSocialPlatformRoleLearningV1({
    evaluatedAt,
    snapshots: [sourceSnapshot],
    outcomeLinkage: compileSocialBusinessOutcomeLinkageV1({ generatedAt: "2026-09-18T16:30:00.000Z", socialSnapshots: [sourceSnapshot], outcomes: [] }),
    policy,
  });

  assert.equal(compiled.status, "VERIFY_REQUIRED");
  assert.equal(compiled.profiles[0]!.sourceTruth, "VERIFY_REQUIRED");
  assert.ok(compiled.profiles[0]!.roles.every((item) => item.state === "VERIFY_REQUIRED"));
});

test("allows fresh first-party role evidence while withholding stale business-role linkage", () => {
  const sourceSnapshot = snapshot();
  const compiled = compileSocialPlatformRoleLearningV1({
    evaluatedAt,
    snapshots: [sourceSnapshot],
    outcomeLinkage: compileSocialBusinessOutcomeLinkageV1({
      generatedAt: "2026-09-16T12:00:00.000Z",
      socialSnapshots: [sourceSnapshot],
      outcomes: [],
    }),
    policy,
  });

  assert.equal(role(compiled, "DISCOVERY").state, "SUPPORTED_FOR_ROLE_REVIEW");
  assert.equal(role(compiled, "TRAFFIC").state, "SUPPORTED_FOR_ROLE_REVIEW");
  assert.equal(role(compiled, "COLLECTOR_INTENT").state, "VERIFY_REQUIRED");
  assert.equal(role(compiled, "PARTNERSHIP").state, "VERIFY_REQUIRED");
  assert.equal(role(compiled, "MEDIA_PRESTIGE").state, "VERIFY_REQUIRED");
  assert.equal(compiled.status, "PARTIAL");
});

test("never upgrades associated outcomes into direct-tracked business evidence", () => {
  const sourceSnapshot = snapshot();
  const linkage = compileSocialBusinessOutcomeLinkageV1({
    generatedAt: "2026-09-18T16:30:00.000Z",
    socialSnapshots: [sourceSnapshot],
    outcomes: [
      {
        outcomeId: "inquiry-1",
        kind: "INQUIRY",
        source: "CRM",
        sourceRecordRef: "crm:inquiry-1",
        occurredAt: "2026-09-15T12:00:00.000Z",
        observedAt: "2026-09-18T16:00:00.000Z",
        truthState: "KNOWN",
        completeThroughAt: "2026-09-18T16:00:00.000Z",
        evidenceRefs: ["evidence:inquiry-1"],
        socialContentRef: { platform: "INSTAGRAM", contentId: "post-1" },
        linkEvidence: {
          basis: "EXACT_CAMPAIGN_REF",
          attributionRef: "campaign:collector-1",
          evidenceRefs: ["evidence:campaign-collector-1"],
        },
      },
      {
        outcomeId: "inquiry-2",
        kind: "INQUIRY",
        source: "CRM",
        sourceRecordRef: "crm:inquiry-2",
        occurredAt: "2026-09-16T12:00:00.000Z",
        observedAt: "2026-09-18T16:00:00.000Z",
        truthState: "KNOWN",
        completeThroughAt: "2026-09-18T16:00:00.000Z",
        evidenceRefs: ["evidence:inquiry-2"],
        socialContentRef: { platform: "INSTAGRAM", contentId: "post-2" },
        linkEvidence: {
          basis: "EXACT_CAMPAIGN_REF",
          attributionRef: "campaign:collector-2",
          evidenceRefs: ["evidence:campaign-collector-2"],
        },
      },
    ],
  });

  const compiled = compileSocialPlatformRoleLearningV1({ evaluatedAt, snapshots: [sourceSnapshot], outcomeLinkage: linkage, policy });
  const collector = role(compiled, "COLLECTOR_INTENT");
  assert.equal(collector.state, "OBSERVATION_ONLY");
  assert.equal(collector.basis, "SUPPORTED_BUSINESS_ASSOCIATIONS");
  assert.equal(collector.directTrackedOutcomeCount, 0);
  assert.equal(collector.supportedAssociationCount, 2);
});

test("rejects duplicate account snapshots instead of merging ambiguous channel truth", () => {
  const sourceSnapshot = snapshot();
  const linkage = compileSocialBusinessOutcomeLinkageV1({ generatedAt: "2026-09-18T16:30:00.000Z", socialSnapshots: [sourceSnapshot], outcomes: [] });

  assert.throws(() => compileSocialPlatformRoleLearningV1({
    evaluatedAt,
    snapshots: [sourceSnapshot, sourceSnapshot],
    outcomeLinkage: linkage,
    policy,
  }), /duplicate social account snapshot/);
});

test("rejects credential-bearing evidence rather than surfacing it in learned role output", () => {
  const sourceSnapshot = snapshot({ secretEvidence: true });
  const linkage = compileSocialBusinessOutcomeLinkageV1({ generatedAt: "2026-09-18T16:30:00.000Z", socialSnapshots: [sourceSnapshot], outcomes: [] });

  assert.throws(() => compileSocialPlatformRoleLearningV1({
    evaluatedAt,
    snapshots: [sourceSnapshot],
    outcomeLinkage: linkage,
    policy,
  }), /must not contain a secret reference/);
});

test("is deterministic, deeply immutable, and does not mutate caller inputs", () => {
  const sourceSnapshot = snapshot();
  const linkage = outcomeLinkage(sourceSnapshot);
  const input = { evaluatedAt, snapshots: [sourceSnapshot], outcomeLinkage: linkage, policy } as const;
  const before = structuredClone(input);

  const first = compileSocialPlatformRoleLearningV1(input);
  const second = compileSocialPlatformRoleLearningV1(input);

  assert.deepEqual(first, second);
  assert.deepEqual(input, before);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.profiles), true);
  assert.equal(Object.isFrozen(first.profiles[0]), true);
  assert.equal(Object.isFrozen(first.profiles[0]!.roles), true);
  assert.equal(Object.isFrozen(first.authority), true);
});
