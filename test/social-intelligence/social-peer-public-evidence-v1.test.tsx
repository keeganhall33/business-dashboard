import assert from "node:assert/strict";
import test from "node:test";

import {
  compileSocialPeerPublicEvidenceV1,
  type SocialPeerPublicObservationInputV1
} from "../../src/lib/social-intelligence/social-peer-public-evidence-v1";

const asOf = "2026-09-18T08:00:00Z";

function observation(
  id: string,
  contentId: string,
  overrides: Partial<SocialPeerPublicObservationInputV1> = {}
): SocialPeerPublicObservationInputV1 {
  return {
    observationId: id,
    peerId: "peer-a",
    peerDisplayName: "Peer A",
    platform: "INSTAGRAM",
    sourceKind: "PUBLIC_PLATFORM_PAGE",
    sourceRef: `public:peer-a:${contentId}`,
    observedAt: "2026-09-10T12:00:00Z",
    capturedAt: "2026-09-18T07:00:00Z",
    contentId,
    format: "process reel",
    seriesLabel: "studio process",
    hookText: "close-up reveal",
    evidenceRefs: [`evidence:${id}`],
    ...overrides
  };
}

test("reports only repeated facts across distinct public content without claiming performance or relationships", () => {
  const result = compileSocialPeerPublicEvidenceV1({
    asOf,
    observations: [
      observation("obs-1", "post-1", { visibleParticipant: "Named participant shown in post" }),
      observation("obs-1b", "post-1", {
        capturedAt: "2026-09-18T07:30:00Z",
        evidenceRefs: ["evidence:obs-1b"],
        visibleParticipant: "Named participant shown in post"
      }),
      observation("obs-2", "post-2", {
        observedAt: "2026-09-12T12:00:00Z",
        visibleParticipant: "Named participant shown in post"
      })
    ]
  });

  assert.equal(result.status, "READY");
  assert.equal(result.externalAccessPerformed, false);
  assert.equal(result.writesPerformed, false);
  assert.equal(result.observations.every((row) => row.performanceClaim === false), true);
  assert.equal(result.observations.every((row) => row.relationshipClaim === false), true);

  const format = result.patterns.find((pattern) => pattern.dimension === "FORMAT");
  assert.ok(format);
  assert.equal(format.distinctContentCount, 2);
  assert.equal(format.performanceClaim, false);
  assert.equal(format.relationshipClaim, false);
  assert.equal(format.causalClaim, false);
  assert.match(format.statement, /repetition only, not performance, causality, endorsement, or a relationship/i);

  const visibleParticipant = result.patterns.find((pattern) => pattern.dimension === "VISIBLE_PARTICIPANT");
  assert.ok(visibleParticipant);
  assert.equal(visibleParticipant.distinctContentCount, 2);
  assert.equal(visibleParticipant.relationshipClaim, false);
  assert.equal(JSON.stringify(result).includes("sponsored by"), false);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.patterns), true);
});

test("keeps cadence UNKNOWN unless complete public timeline coverage is explicitly evidenced", () => {
  const result = compileSocialPeerPublicEvidenceV1({
    asOf,
    observations: [observation("obs-1", "post-1"), observation("obs-2", "post-2")],
    coverageWindows: [
      {
        peerId: "peer-a",
        platform: "INSTAGRAM",
        startAt: "2026-09-04T00:00:00Z",
        endAt: "2026-09-18T00:00:00Z",
        coverage: "PARTIAL",
        evidenceRefs: ["coverage:partial"]
      }
    ]
  });

  assert.equal(result.cadence.length, 1);
  assert.equal(result.cadence[0]?.state, "UNKNOWN");
  assert.equal(result.cadence[0]?.observedPostCount, null);
  assert.equal(result.cadence[0]?.observedPostsPerWeek, null);
  assert.match(result.cadence[0]?.limitation ?? "", /complete public-timeline coverage was not evidenced/i);
});

test("calculates bounded public cadence only for an evidenced complete window and deduplicates content identities", () => {
  const result = compileSocialPeerPublicEvidenceV1({
    asOf,
    observations: [
      observation("obs-1", "post-1", { observedAt: "2026-09-05T12:00:00Z" }),
      observation("obs-1b", "post-1", {
        observedAt: "2026-09-05T12:00:00Z",
        capturedAt: "2026-09-18T07:30:00Z"
      }),
      observation("obs-2", "post-2", { observedAt: "2026-09-10T12:00:00Z" }),
      observation("obs-3", "post-3", { observedAt: "2026-09-15T12:00:00Z" }),
      observation("outside", "post-outside", { observedAt: "2026-08-20T12:00:00Z" })
    ],
    coverageWindows: [
      {
        peerId: "peer-a",
        platform: "INSTAGRAM",
        startAt: "2026-09-04T00:00:00Z",
        endAt: "2026-09-18T00:00:00Z",
        coverage: "COMPLETE_PUBLIC_TIMELINE",
        evidenceRefs: ["coverage:complete-window"]
      }
    ]
  });

  const cadence = result.cadence[0];
  assert.equal(cadence?.state, "OBSERVED_COMPLETE_WINDOW");
  assert.equal(cadence?.observedPostCount, 3);
  assert.equal(cadence?.observedPostsPerWeek, 1.5);
  assert.equal(cadence?.performanceClaim, false);
  assert.match(cadence?.limitation ?? "", /not a forecast or performance claim/i);
});

test("stale evidence remains visible but cannot create current peer patterns", () => {
  const result = compileSocialPeerPublicEvidenceV1({
    asOf,
    observations: [
      observation("old-1", "post-old-1", {
        observedAt: "2025-12-01T00:00:00Z",
        capturedAt: "2026-01-01T00:00:00Z"
      }),
      observation("old-2", "post-old-2", {
        observedAt: "2025-12-05T00:00:00Z",
        capturedAt: "2026-01-02T00:00:00Z"
      })
    ]
  });

  assert.equal(result.status, "INSUFFICIENT_EVIDENCE");
  assert.deepEqual(result.staleObservationIds, ["old-1", "old-2"]);
  assert.deepEqual(result.patterns, []);
});

test("fails closed on peer identity conflicts, unsupported sources, and missing provenance", () => {
  assert.throws(
    () =>
      compileSocialPeerPublicEvidenceV1({
        asOf,
        observations: [
          observation("obs-1", "post-1"),
          observation("obs-2", "post-2", { peerDisplayName: "Different Entity" })
        ]
      }),
    /conflicting peer identity/i
  );

  assert.throws(
    () =>
      compileSocialPeerPublicEvidenceV1({
        asOf,
        observations: [observation("obs-1", "post-1", { sourceKind: "PRIVATE_ANALYTICS" as never })]
      }),
    /supported public source/i
  );

  assert.throws(
    () =>
      compileSocialPeerPublicEvidenceV1({
        asOf,
        observations: [observation("obs-1", "post-1", { evidenceRefs: [] })]
      }),
    /requires public\/compliant evidence/i
  );
});

test("rejects future capture, duplicate observation IDs, and orphaned coverage windows", () => {
  assert.throws(
    () =>
      compileSocialPeerPublicEvidenceV1({
        asOf,
        observations: [observation("future", "post-1", { capturedAt: "2026-09-19T00:00:00Z" })]
      }),
    /capturedAt cannot be after asOf/i
  );

  assert.throws(
    () =>
      compileSocialPeerPublicEvidenceV1({
        asOf,
        observations: [observation("same-id", "post-1"), observation("same-id", "post-2")]
      }),
    /duplicate observationId/i
  );

  assert.throws(
    () =>
      compileSocialPeerPublicEvidenceV1({
        asOf,
        observations: [observation("obs-1", "post-1")],
        coverageWindows: [
          {
            peerId: "other-peer",
            platform: "INSTAGRAM",
            startAt: "2026-09-04T00:00:00Z",
            endAt: "2026-09-18T00:00:00Z",
            coverage: "COMPLETE_PUBLIC_TIMELINE",
            evidenceRefs: ["coverage:other"]
          }
        ]
      }),
    /coverage window requires at least one matching public observation/i
  );
});
