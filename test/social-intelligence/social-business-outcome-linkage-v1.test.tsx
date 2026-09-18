import assert from "node:assert/strict";
import test from "node:test";

import { compileCanonicalSocialAccountSnapshotV1 } from "../../src/lib/social-intelligence/social-canonical-v1";
import {
  compileSocialBusinessOutcomeLinkageV1,
  type SocialBusinessOutcomeObservationInputV1
} from "../../src/lib/social-intelligence/social-business-outcome-linkage-v1";

const generatedAt = "2026-09-18T12:00:00Z";

function socialSnapshot(options?: {
  accountId?: string;
  contentId?: string;
  retrievedAt?: string;
  connected?: boolean;
}) {
  return compileCanonicalSocialAccountSnapshotV1(
    {
      platform: "INSTAGRAM",
      accountId: options?.accountId ?? "keegan-hall",
      retrievedAt: options?.retrievedAt ?? "2026-09-18T09:00:00Z",
      sourceCoverage: {
        requestedState: options?.connected === false ? "AVAILABLE_NEEDS_IMPLEMENTATION" : "CONNECTED_AND_INGESTING",
        lastSuccessfulSyncAt: options?.connected === false ? null : "2026-09-18T09:00:00Z",
        metricCoverage: ["VIEWS", "LINK_CLICKS"]
      },
      periods: [],
      content: [
        {
          contentId: options?.contentId ?? "post-1",
          publishedAt: "2026-09-18T08:00:00Z",
          format: "REEL",
          subject: "Seattle Seahawks throwback helmet",
          attributionConfidence: "MODERATE",
          metrics: {
            VIEWS: { value: 10_000, evidenceRefs: ["social:ig:post-1:views"] },
            LINK_CLICKS: { value: 50, evidenceRefs: ["social:ig:post-1:clicks"] }
          }
        }
      ]
    },
    generatedAt
  );
}

function directOutcome(overrides: Partial<SocialBusinessOutcomeObservationInputV1> = {}): SocialBusinessOutcomeObservationInputV1 {
  return {
    outcomeId: "purchase-1",
    kind: "PURCHASE",
    source: "COMMERCE",
    sourceRecordRef: "woo:order:event-1",
    occurredAt: "2026-09-18T10:00:00Z",
    observedAt: "2026-09-18T10:05:00Z",
    truthState: "KNOWN",
    completeThroughAt: "2026-09-18T10:10:00Z",
    evidenceRefs: ["evidence:woo:event-1"],
    socialContentRef: { platform: "INSTAGRAM", contentId: "post-1" },
    linkEvidence: {
      basis: "EXACT_TRACKING_REF",
      attributionRef: "tracking:utm:helmet-wip:1",
      evidenceRefs: ["evidence:tracking:helmet-wip:1"]
    },
    ...overrides
  };
}

test("links an explicitly tracked downstream outcome without converting association into causality or revenue attribution", () => {
  const result = compileSocialBusinessOutcomeLinkageV1({
    generatedAt,
    socialSnapshots: [socialSnapshot()],
    outcomes: [directOutcome()]
  });

  assert.equal(result.rows[0].disposition, "DIRECT_LINK");
  assert.equal(result.rows[0].attributionClass, "DIRECT_TRACKED");
  assert.equal(result.rows[0].socialContentRef, "INSTAGRAM:post-1");
  assert.equal(result.rows[0].upstreamAttributionConfidence, "MODERATE");
  assert.equal(result.rows[0].causalClaim, false);
  assert.equal(result.rows[0].revenueAttributionClaim, false);
  assert.equal(result.rows[0].monetaryValue, null);
  assert.deepEqual(result.rows[0].evidenceRefs, ["evidence:tracking:helmet-wip:1", "evidence:woo:event-1"]);

  assert.equal(result.byContent[0].linkedOutcomeCount, 1);
  assert.equal(result.byContent[0].directTrackedOutcomeCount, 1);
  assert.equal(result.byContent[0].outcomeCounts.PURCHASE, 1);
  assert.equal(result.byContent[0].strongestAttributionClass, "DIRECT_TRACKED");
  assert.equal(result.byContent[0].revenueAttributionClaim, false);
});

test("keeps exact campaign and content-reference linkage as supported association rather than direct attribution", () => {
  const result = compileSocialBusinessOutcomeLinkageV1({
    generatedAt,
    socialSnapshots: [socialSnapshot()],
    outcomes: [
      directOutcome({
        outcomeId: "signup-1",
        kind: "EMAIL_SIGNUP",
        source: "EMAIL",
        sourceRecordRef: "email:signup:event-1",
        linkEvidence: {
          basis: "EXACT_CAMPAIGN_REF",
          attributionRef: "campaign:helmet-wip",
          evidenceRefs: ["evidence:campaign:helmet-wip"]
        }
      }),
      directOutcome({
        outcomeId: "session-1",
        kind: "SITE_SESSION",
        source: "GA4",
        sourceRecordRef: "ga4:session:event-1",
        linkEvidence: {
          basis: "EXACT_CONTENT_REF",
          attributionRef: "content:instagram:post-1",
          evidenceRefs: ["evidence:content-ref:post-1"]
        }
      })
    ]
  });

  assert.deepEqual(result.rows.map((row) => row.disposition), ["ASSOCIATED_LINK", "ASSOCIATED_LINK"]);
  assert.deepEqual(result.rows.map((row) => row.attributionClass), ["SUPPORTED_ASSOCIATION", "SUPPORTED_ASSOCIATION"]);
  assert.equal(result.byContent[0].linkedOutcomeCount, 2);
  assert.equal(result.byContent[0].directTrackedOutcomeCount, 0);
  assert.equal(result.byContent[0].strongestAttributionClass, "SUPPORTED_ASSOCIATION");
});

test("fails closed for inferred, unknown, stale, partial, and conflicted outcome truth", () => {
  const truthStates = ["INFERRED", "UNKNOWN", "STALE", "PARTIAL", "CONFLICTED"] as const;
  for (const truthState of truthStates) {
    const result = compileSocialBusinessOutcomeLinkageV1({
      generatedAt,
      socialSnapshots: [socialSnapshot()],
      outcomes: [directOutcome({ outcomeId: `outcome-${truthState}`, sourceRecordRef: `source-${truthState}`, truthState })]
    });
    assert.equal(result.rows[0].disposition, "VERIFY_REQUIRED");
    assert.equal(result.rows[0].attributionClass, "NOT_ESTABLISHED");
    assert.equal(result.rows[0].verificationReasons.includes(`OUTCOME_TRUTH_${truthState}`), true);
    assert.equal(result.byContent.length, 0);
  }
});

test("requires independent outcome evidence, link evidence, and complete-through coverage before linkage becomes decision-grade", () => {
  const noOutcomeEvidence = compileSocialBusinessOutcomeLinkageV1({
    generatedAt,
    socialSnapshots: [socialSnapshot()],
    outcomes: [directOutcome({ evidenceRefs: [] })]
  });
  assert.equal(noOutcomeEvidence.rows[0].disposition, "VERIFY_REQUIRED");
  assert.equal(noOutcomeEvidence.rows[0].verificationReasons.includes("OUTCOME_EVIDENCE_REQUIRED"), true);

  const noLinkEvidence = compileSocialBusinessOutcomeLinkageV1({
    generatedAt,
    socialSnapshots: [socialSnapshot()],
    outcomes: [directOutcome({
      linkEvidence: { basis: "EXACT_TRACKING_REF", attributionRef: "tracking:1", evidenceRefs: [] }
    })]
  });
  assert.equal(noLinkEvidence.rows[0].verificationReasons.includes("LINK_EVIDENCE_REQUIRED"), true);

  const unknownCoverage = compileSocialBusinessOutcomeLinkageV1({
    generatedAt,
    socialSnapshots: [socialSnapshot()],
    outcomes: [directOutcome({ completeThroughAt: null })]
  });
  assert.equal(unknownCoverage.rows[0].verificationReasons.includes("SOURCE_COMPLETENESS_UNKNOWN"), true);

  const incompleteCoverage = compileSocialBusinessOutcomeLinkageV1({
    generatedAt,
    socialSnapshots: [socialSnapshot()],
    outcomes: [directOutcome({ completeThroughAt: "2026-09-18T09:59:59Z" })]
  });
  assert.equal(incompleteCoverage.rows[0].verificationReasons.includes("SOURCE_INCOMPLETE_THROUGH_OUTCOME"), true);
});

test("does not treat content from an unproven or stale social source as a linked business outcome", () => {
  const unavailable = compileSocialBusinessOutcomeLinkageV1({
    generatedAt,
    socialSnapshots: [socialSnapshot({ connected: false })],
    outcomes: [directOutcome()]
  });
  assert.equal(unavailable.rows[0].disposition, "VERIFY_REQUIRED");
  assert.equal(unavailable.rows[0].verificationReasons.includes("SOCIAL_CONTENT_SOURCE_NOT_LIVE_AND_FRESH"), true);
  assert.equal(unavailable.byContent.length, 0);

  const stale = compileCanonicalSocialAccountSnapshotV1(
    {
      platform: "INSTAGRAM",
      accountId: "stale-account",
      retrievedAt: "2026-09-18T09:00:00Z",
      sourceCoverage: {
        requestedState: "CONNECTED_AND_INGESTING",
        lastSuccessfulSyncAt: "2026-09-10T09:00:00Z"
      },
      periods: [],
      content: [{ contentId: "post-1", publishedAt: "2026-09-18T08:00:00Z" }]
    },
    generatedAt,
    48
  );
  const staleResult = compileSocialBusinessOutcomeLinkageV1({ generatedAt, socialSnapshots: [stale], outcomes: [directOutcome()] });
  assert.equal(staleResult.rows[0].verificationReasons.includes("SOCIAL_CONTENT_SOURCE_NOT_LIVE_AND_FRESH"), true);
});

test("rejects impossible temporal evidence and refuses outcomes that predate the referenced content", () => {
  assert.throws(
    () => compileSocialBusinessOutcomeLinkageV1({
      generatedAt,
      socialSnapshots: [socialSnapshot()],
      outcomes: [directOutcome({ observedAt: "2026-09-18T12:00:01Z" })]
    }),
    /observedAt must not be after generatedAt/
  );

  assert.throws(
    () => compileSocialBusinessOutcomeLinkageV1({
      generatedAt,
      socialSnapshots: [socialSnapshot()],
      outcomes: [directOutcome({ occurredAt: "2026-09-18T10:10:01Z", observedAt: "2026-09-18T10:10:00Z" })]
    }),
    /occurredAt must not be after observedAt/
  );

  const predatesContent = compileSocialBusinessOutcomeLinkageV1({
    generatedAt,
    socialSnapshots: [socialSnapshot()],
    outcomes: [directOutcome({
      occurredAt: "2026-09-18T07:59:59Z",
      observedAt: "2026-09-18T08:05:00Z",
      completeThroughAt: "2026-09-18T08:05:00Z"
    })]
  });
  assert.equal(predatesContent.rows[0].disposition, "VERIFY_REQUIRED");
  assert.equal(predatesContent.rows[0].verificationReasons.includes("OUTCOME_PRECEDES_CONTENT"), true);
});

test("requires exact canonical content identity and fails closed on missing or ambiguous references", () => {
  const missing = compileSocialBusinessOutcomeLinkageV1({
    generatedAt,
    socialSnapshots: [socialSnapshot()],
    outcomes: [directOutcome({ socialContentRef: { platform: "INSTAGRAM", contentId: "missing-post" } })]
  });
  assert.equal(missing.rows[0].verificationReasons.includes("CONTENT_REF_NOT_FOUND"), true);

  const ambiguous = compileSocialBusinessOutcomeLinkageV1({
    generatedAt,
    socialSnapshots: [socialSnapshot({ accountId: "a" }), socialSnapshot({ accountId: "b" })],
    outcomes: [directOutcome()]
  });
  assert.equal(ambiguous.rows[0].disposition, "VERIFY_REQUIRED");
  assert.equal(ambiguous.rows[0].verificationReasons.includes("AMBIGUOUS_CONTENT_REF"), true);
  assert.equal(ambiguous.byContent.length, 0);
});

test("keeps an unlinked business event visible without inventing social attribution", () => {
  const result = compileSocialBusinessOutcomeLinkageV1({
    generatedAt,
    socialSnapshots: [socialSnapshot()],
    outcomes: [directOutcome({ socialContentRef: null, linkEvidence: null })]
  });
  assert.equal(result.rows[0].disposition, "UNLINKED");
  assert.equal(result.rows[0].attributionClass, "NOT_ESTABLISHED");
  assert.equal(result.rows[0].socialContentRef, null);
  assert.equal(result.byContent.length, 0);
});

test("requires the content reference and its linkage evidence together", () => {
  const missingLink = compileSocialBusinessOutcomeLinkageV1({
    generatedAt,
    socialSnapshots: [socialSnapshot()],
    outcomes: [directOutcome({ linkEvidence: null })]
  });
  assert.equal(missingLink.rows[0].disposition, "VERIFY_REQUIRED");
  assert.equal(missingLink.rows[0].verificationReasons.includes("CONTENT_REF_AND_LINK_EVIDENCE_MUST_BOTH_BE_PRESENT"), true);

  const missingContent = compileSocialBusinessOutcomeLinkageV1({
    generatedAt,
    socialSnapshots: [socialSnapshot()],
    outcomes: [directOutcome({ socialContentRef: null })]
  });
  assert.equal(missingContent.rows[0].verificationReasons.includes("CONTENT_REF_AND_LINK_EVIDENCE_MUST_BOTH_BE_PRESENT"), true);
});

test("rejects duplicate downstream identities so one event cannot inflate outcome counts", () => {
  assert.throws(
    () => compileSocialBusinessOutcomeLinkageV1({
      generatedAt,
      socialSnapshots: [socialSnapshot()],
      outcomes: [directOutcome(), directOutcome({ sourceRecordRef: "second-source" })]
    }),
    /duplicate outcomeId/
  );

  assert.throws(
    () => compileSocialBusinessOutcomeLinkageV1({
      generatedAt,
      socialSnapshots: [socialSnapshot()],
      outcomes: [directOutcome(), directOutcome({ outcomeId: "second-outcome" })]
    }),
    /duplicate sourceRecordRef/
  );
});

test("rejects credential references and unsupported fields at the provider-independent boundary", () => {
  assert.throws(
    () => compileSocialBusinessOutcomeLinkageV1({
      generatedAt,
      socialSnapshots: [socialSnapshot()],
      outcomes: [directOutcome({ evidenceRefs: ["op://Social/provider-token"] })]
    }),
    /secret reference/
  );

  const malformed = {
    ...directOutcome(),
    revenue: 1000
  } as SocialBusinessOutcomeObservationInputV1;
  assert.throws(
    () => compileSocialBusinessOutcomeLinkageV1({ generatedAt, socialSnapshots: [socialSnapshot()], outcomes: [malformed] }),
    /revenue is not supported/
  );
});

test("produces deterministic immutable bounded output with zero provider access or write authority", () => {
  const input = {
    generatedAt,
    socialSnapshots: [socialSnapshot()],
    outcomes: [
      directOutcome({ outcomeId: "inquiry-2", kind: "INQUIRY", source: "CRM", sourceRecordRef: "crm:inquiry:2", occurredAt: "2026-09-18T11:00:00Z", observedAt: "2026-09-18T11:01:00Z", completeThroughAt: "2026-09-18T11:02:00Z" }),
      directOutcome({ outcomeId: "session-1", kind: "SITE_SESSION", source: "GA4", sourceRecordRef: "ga4:session:1", occurredAt: "2026-09-18T09:30:00Z", observedAt: "2026-09-18T09:31:00Z", completeThroughAt: "2026-09-18T09:32:00Z" })
    ]
  } as const;

  const first = compileSocialBusinessOutcomeLinkageV1(input);
  const second = compileSocialBusinessOutcomeLinkageV1(input);
  assert.deepEqual(first, second);
  assert.deepEqual(first.rows.map((row) => row.outcomeId), ["session-1", "inquiry-2"]);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.rows[0]), true);
  assert.equal(Object.isFrozen(first.byContent[0].outcomeCounts), true);
  assert.equal(first.externalAccessPerformed, false);
  assert.equal(first.writesPerformed, false);
  assert.equal(first.limitations.some((line) => /not proof.*caused/i.test(line)), true);
  assert.equal(first.limitations.some((line) => /does not calculate or attribute revenue/i.test(line)), true);
});
