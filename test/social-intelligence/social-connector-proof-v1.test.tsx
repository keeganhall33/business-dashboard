import assert from "node:assert/strict";
import test from "node:test";

import {
  compileCanonicalSocialAccountSnapshotV1,
  type CanonicalSocialAccountSnapshotV1,
  type SocialPlatformV1
} from "../../src/lib/social-intelligence/social-canonical-v1";
import {
  compileSocialConnectorRegistryV1,
  type SocialPlatformConnectorInputV1
} from "../../src/lib/social-intelligence/social-connector-proof-v1";

const now = "2026-09-18T05:40:00Z";

function provenInstagramSnapshot(retrievedAt = "2026-09-18T05:30:00Z"): CanonicalSocialAccountSnapshotV1 {
  return compileCanonicalSocialAccountSnapshotV1(
    {
      platform: "INSTAGRAM",
      accountId: "keegan-hall",
      handle: "@keeganhall",
      retrievedAt,
      sourceCoverage: {
        requestedState: "CONNECTED_AND_INGESTING",
        lastSuccessfulSyncAt: retrievedAt,
        metricCoverage: ["AUDIENCE_TOTAL", "REACH", "VIEWS", "SAVES"],
        limitations: ["Provider does not expose cross-platform audience overlap"]
      },
      periods: [
        {
          periodId: `ig-7d-${retrievedAt}`,
          window: "7D",
          startAt: "2026-09-11T00:00:00Z",
          endAt: "2026-09-18T00:00:00Z",
          metrics: {
            AUDIENCE_TOTAL: { value: 12_500, evidenceRefs: ["provider:instagram:audience:2026-09-18"] },
            REACH: { value: 41_250, evidenceRefs: ["provider:instagram:reach:2026-09-18"] },
            VIEWS: { value: 76_000, evidenceRefs: ["provider:instagram:views:2026-09-18"] },
            SAVES: { value: 540, evidenceRefs: ["provider:instagram:saves:2026-09-18"] }
          }
        }
      ]
    },
    retrievedAt
  );
}

function platformInput(platform: SocialPlatformV1): SocialPlatformConnectorInputV1 {
  switch (platform) {
    case "INSTAGRAM": {
      const snapshot = provenInstagramSnapshot();
      return {
        platform,
        connectorId: "meta-graph-instagram",
        availability: "AVAILABLE",
        authorizationState: "AUTHORIZED",
        implementationState: "IMPLEMENTED",
        sourceKind: "OFFICIAL_API",
        readOnly: true,
        supportedMetrics: ["AUDIENCE_TOTAL", "REACH", "VIEWS", "SAVES"],
        historicalBackfill: "LIMITED",
        limitations: ["Historical depth is provider bounded"],
        proof: {
          liveFirstPartyData: true,
          syncOutcome: "SUCCESS",
          retrievedAt: snapshot.retrievedAt,
          providerEvidenceRefs: ["provider-request:meta:ig:request-123"],
          snapshot
        }
      };
    }
    case "FACEBOOK":
      return {
        platform,
        connectorId: "meta-graph-facebook",
        availability: "AVAILABLE",
        authorizationState: "AUTHORIZED",
        implementationState: "IMPLEMENTED",
        sourceKind: "OFFICIAL_API",
        readOnly: true,
        supportedMetrics: ["REACH", "VIEWS"],
        historicalBackfill: "LIMITED",
        limitations: ["Authorized but no end-to-end production proof has been supplied"]
      };
    case "YOUTUBE":
      return {
        platform,
        connectorId: "youtube-analytics",
        availability: "AVAILABLE",
        authorizationState: "AUTHORIZED",
        implementationState: "NOT_IMPLEMENTED",
        sourceKind: "OFFICIAL_API",
        readOnly: true,
        supportedMetrics: ["AUDIENCE_TOTAL", "VIEWS", "WATCH_TIME_SECONDS"],
        historicalBackfill: "SUPPORTED"
      };
    case "TIKTOK":
      return {
        platform,
        connectorId: "tiktok-authorized",
        availability: "AVAILABLE",
        authorizationState: "NEEDS_KEEGAN_CONNECTION",
        implementationState: "NOT_IMPLEMENTED",
        sourceKind: "OFFICIAL_API",
        readOnly: true,
        historicalBackfill: "UNKNOWN",
        limitations: ["Account authorization is not yet proven"]
      };
    case "X":
      return {
        platform,
        connectorId: "x-read-api",
        availability: "UNAVAILABLE",
        authorizationState: "NOT_APPLICABLE",
        implementationState: "NOT_IMPLEMENTED",
        sourceKind: null,
        readOnly: true,
        historicalBackfill: "UNKNOWN",
        limitations: ["No authorized source is configured"]
      };
    case "THREADS":
      return {
        platform,
        connectorId: "threads-api",
        availability: "UNAVAILABLE",
        authorizationState: "NOT_APPLICABLE",
        implementationState: "NOT_IMPLEMENTED",
        sourceKind: null,
        readOnly: true,
        historicalBackfill: "UNKNOWN",
        limitations: ["Availability has not been established"]
      };
    case "LINKEDIN":
      return {
        platform,
        connectorId: "linkedin-authorized",
        availability: "NOT_RECOMMENDED",
        authorizationState: "NOT_APPLICABLE",
        implementationState: "NOT_IMPLEMENTED",
        sourceKind: null,
        readOnly: true,
        historicalBackfill: "UNKNOWN",
        limitations: ["No decision-useful authorized connector has been selected"]
      };
  }
}

function completeRegistryInputs(): SocialPlatformConnectorInputV1[] {
  return ["INSTAGRAM", "FACEBOOK", "YOUTUBE", "TIKTOK", "X", "THREADS", "LINKEDIN"].map((platform) => platformInput(platform as SocialPlatformV1));
}

test("requires an explicit readiness state for every target platform while proving only evidence-backed live channels", () => {
  const result = compileSocialConnectorRegistryV1(completeRegistryInputs(), now);

  assert.equal(result.allTargetPlatformsExplicit, true);
  assert.equal(result.platforms.length, 7);
  assert.deepEqual(result.livePlatforms, ["INSTAGRAM"]);
  assert.deepEqual(result.platformsNeedingKeeganAction, ["TIKTOK"]);
  assert.equal(result.platforms.find((row) => row.platform === "INSTAGRAM")?.readiness, "LIVE_PROVEN");
  assert.equal(result.platforms.find((row) => row.platform === "FACEBOOK")?.readiness, "AUTHORIZED_NOT_PROVEN");
  assert.equal(result.platforms.find((row) => row.platform === "YOUTUBE")?.readiness, "AVAILABLE_NEEDS_IMPLEMENTATION");
  assert.equal(result.platforms.find((row) => row.platform === "X")?.readiness, "NOT_AVAILABLE");
  assert.equal(result.platforms.find((row) => row.platform === "LINKEDIN")?.readiness, "NOT_RECOMMENDED");
  assert.equal(result.externalAccessPerformed, false);
  assert.equal(result.writesPerformed, false);
});

test("keeps partial live ingestion distinct from complete proof", () => {
  const inputs = completeRegistryInputs();
  const instagram = inputs.find((row) => row.platform === "INSTAGRAM")!;
  inputs[0] = {
    ...instagram,
    proof: instagram.proof ? { ...instagram.proof, syncOutcome: "PARTIAL" } : null,
    limitations: ["Content pagination stopped at provider rate limit and must resume"]
  };

  const result = compileSocialConnectorRegistryV1(inputs, now);
  const state = result.platforms.find((row) => row.platform === "INSTAGRAM")!;
  assert.equal(state.readiness, "LIVE_PARTIAL");
  assert.equal(state.liveFirstPartyDataProven, true);
  assert.match(state.limitations[0] ?? "", /rate limit/i);
});

test("marks old live evidence stale instead of presenting it as current", () => {
  const inputs = completeRegistryInputs();
  const staleSnapshot = provenInstagramSnapshot("2026-09-14T05:30:00Z");
  const instagram = inputs[0];
  inputs[0] = {
    ...instagram,
    proof: {
      liveFirstPartyData: true,
      syncOutcome: "SUCCESS",
      retrievedAt: staleSnapshot.retrievedAt,
      providerEvidenceRefs: ["provider-request:meta:ig:old-request"],
      snapshot: staleSnapshot
    }
  };

  const result = compileSocialConnectorRegistryV1(inputs, now, 48);
  assert.deepEqual(result.livePlatforms, []);
  assert.deepEqual(result.stalePlatforms, ["INSTAGRAM"]);
  assert.equal(result.platforms[0].readiness, "LIVE_STALE");
  assert.equal(result.platforms[0].liveFirstPartyDataProven, true);
});

test("refuses to turn authorization or implementation alone into fake live proof", () => {
  const result = compileSocialConnectorRegistryV1(completeRegistryInputs(), now);
  const facebook = result.platforms.find((row) => row.platform === "FACEBOOK")!;
  const youtube = result.platforms.find((row) => row.platform === "YOUTUBE")!;

  assert.equal(facebook.liveFirstPartyDataProven, false);
  assert.equal(facebook.proof, null);
  assert.equal(youtube.liveFirstPartyDataProven, false);
  assert.equal(youtube.proof, null);
});

test("rejects incomplete registries instead of silently dropping target platforms", () => {
  const inputs = completeRegistryInputs().filter((row) => row.platform !== "THREADS");
  assert.throws(() => compileSocialConnectorRegistryV1(inputs, now), /all target platforms must be explicit.*THREADS/i);
});

test("rejects duplicate platform states so conflicting connector claims cannot coexist silently", () => {
  const inputs = completeRegistryInputs();
  inputs.push(platformInput("INSTAGRAM"));
  assert.throws(() => compileSocialConnectorRegistryV1(inputs, now), /duplicate connector state.*INSTAGRAM/i);
});

test("rejects provider proof without matching canonical platform evidence", () => {
  const inputs = completeRegistryInputs();
  const instagram = inputs[0];
  const snapshot = provenInstagramSnapshot();
  const mismatched = { ...snapshot, platform: "YOUTUBE" as const };
  inputs[0] = {
    ...instagram,
    proof: {
      liveFirstPartyData: true,
      syncOutcome: "SUCCESS",
      retrievedAt: snapshot.retrievedAt,
      providerEvidenceRefs: ["provider-request:meta:ig:request-123"],
      snapshot: mismatched
    }
  };

  assert.throws(() => compileSocialConnectorRegistryV1(inputs, now), /snapshot platform mismatch/i);
});

test("rejects live claims that lack provider provenance or canonical metric evidence", () => {
  const noProviderEvidence = completeRegistryInputs();
  const instagram = noProviderEvidence[0];
  noProviderEvidence[0] = {
    ...instagram,
    proof: instagram.proof ? { ...instagram.proof, providerEvidenceRefs: [] } : null
  };
  assert.throws(() => compileSocialConnectorRegistryV1(noProviderEvidence, now), /provider provenance evidence/i);

  const noCanonicalEvidence = completeRegistryInputs();
  const cleanSnapshot = compileCanonicalSocialAccountSnapshotV1(
    {
      platform: "INSTAGRAM",
      accountId: "keegan-hall",
      retrievedAt: "2026-09-18T05:30:00Z",
      sourceCoverage: {
        requestedState: "CONNECTED_AND_INGESTING",
        lastSuccessfulSyncAt: "2026-09-18T05:30:00Z",
        metricCoverage: ["AUDIENCE_TOTAL"]
      },
      periods: [{
        periodId: "no-evidence",
        window: "7D",
        startAt: "2026-09-11T00:00:00Z",
        endAt: "2026-09-18T00:00:00Z",
        metrics: { AUDIENCE_TOTAL: 12_500 }
      }]
    },
    now
  );
  const base = noCanonicalEvidence[0];
  noCanonicalEvidence[0] = {
    ...base,
    proof: {
      liveFirstPartyData: true,
      syncOutcome: "SUCCESS",
      retrievedAt: cleanSnapshot.retrievedAt,
      providerEvidenceRefs: ["provider-request:meta:ig:request-456"],
      snapshot: cleanSnapshot
    }
  };
  assert.throws(() => compileSocialConnectorRegistryV1(noCanonicalEvidence, now), /canonical metric\/content evidence/i);
});

test("rejects credential material so tokens and secrets never enter canonical connector state", () => {
  const inputs = completeRegistryInputs();
  const unsafe = {
    ...inputs[0],
    accessToken: "should-never-be-here"
  } as SocialPlatformConnectorInputV1;
  inputs[0] = unsafe;

  assert.throws(() => compileSocialConnectorRegistryV1(inputs, now), /credential material.*never carry secrets/i);
});

test("rejects write-capable connectors even when a caller bypasses the TypeScript literal type", () => {
  const inputs = completeRegistryInputs();
  inputs[0] = { ...inputs[0], readOnly: false } as unknown as SocialPlatformConnectorInputV1;
  assert.throws(() => compileSocialConnectorRegistryV1(inputs, now), /must be read-only/i);
});

test("does not mutate caller input and freezes the compiled registry", () => {
  const inputs = completeRegistryInputs();
  const before = JSON.stringify(inputs);
  const result = compileSocialConnectorRegistryV1(inputs, now);

  assert.equal(JSON.stringify(inputs), before);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.platforms), true);
  assert.equal(Object.isFrozen(result.platforms[0]), true);
  assert.equal(Object.isFrozen(result.platforms[0].proof), true);
});
