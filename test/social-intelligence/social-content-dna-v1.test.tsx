import assert from "node:assert/strict";
import test from "node:test";

import {
  compileCanonicalSocialAccountSnapshotV1,
  type SocialContentInputV1,
  type SocialPlatformV1
} from "../../src/lib/social-intelligence/social-canonical-v1";
import {
  SOCIAL_CONTENT_DNA_MAX_SNAPSHOTS,
  analyzeSocialContentDnaV1
} from "../../src/lib/social-intelligence/social-content-dna-v1";

const NOW = "2026-09-18T06:00:00.000Z";

function metric(value: number | null, ref: string) {
  return { value, evidenceRefs: [`evidence:${ref}`] } as const;
}

function content(input: {
  id: string;
  publishedAt: string;
  reach: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  saves: number | null;
  profileVisits?: number | null;
  linkClicks?: number | null;
  subject?: string | null;
  format?: string | null;
  businessOutcomeRefs?: readonly string[];
}): SocialContentInputV1 {
  return {
    contentId: input.id,
    publishedAt: input.publishedAt,
    subject: input.subject ?? null,
    format: input.format ?? "REEL",
    amplificationType: "ORGANIC",
    businessOutcomeRefs: input.businessOutcomeRefs ?? [],
    attributionConfidence: input.businessOutcomeRefs?.length ? "MODERATE" : "UNKNOWN",
    productionEffortMinutes: 30,
    metrics: {
      REACH: metric(input.reach, `${input.id}:reach`),
      LIKES: metric(input.likes, `${input.id}:likes`),
      COMMENTS: metric(input.comments, `${input.id}:comments`),
      SHARES: metric(input.shares, `${input.id}:shares`),
      SAVES: metric(input.saves, `${input.id}:saves`),
      PROFILE_VISITS: metric(input.profileVisits ?? 5, `${input.id}:profile`),
      LINK_CLICKS: metric(input.linkClicks ?? 2, `${input.id}:clicks`)
    }
  };
}

function snapshot(options?: {
  platform?: SocialPlatformV1;
  accountId?: string;
  retrievedAt?: string;
  lastSuccessfulSyncAt?: string | null;
  requestedState?: "CONNECTED_AND_INGESTING" | "CONNECTED_PARTIAL" | "AVAILABLE_NEEDS_IMPLEMENTATION";
  contentRows?: readonly SocialContentInputV1[];
}) {
  const platform = options?.platform ?? "INSTAGRAM";
  return compileCanonicalSocialAccountSnapshotV1(
    {
      platform,
      accountId: options?.accountId ?? `${platform.toLowerCase()}-acct`,
      retrievedAt: options?.retrievedAt ?? NOW,
      sourceCoverage: {
        requestedState: options?.requestedState ?? "CONNECTED_AND_INGESTING",
        lastSuccessfulSyncAt: options?.lastSuccessfulSyncAt === undefined ? NOW : options.lastSuccessfulSyncAt,
        metricCoverage: ["REACH", "LIKES", "COMMENTS", "SHARES", "SAVES", "PROFILE_VISITS", "LINK_CLICKS"]
      },
      periods: [],
      content: options?.contentRows ?? []
    },
    NOW,
    48
  );
}

function assertAllNumbersFinite(value: unknown): void {
  if (typeof value === "number") {
    assert.ok(Number.isFinite(value), `expected finite number, received ${String(value)}`);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach(assertAllNumbersFinite);
    return;
  }
  if (value && typeof value === "object") {
    Object.values(value).forEach(assertAllNumbersFinite);
  }
}

const instagramRows = [
  content({
    id: "winner",
    publishedAt: "2026-09-17T12:00:00.000Z",
    reach: 1000,
    likes: 100,
    comments: 20,
    shares: 20,
    saves: 10,
    subject: "Seahawks",
    businessOutcomeRefs: ["outcome:site-session"]
  }),
  content({
    id: "seahawks-2",
    publishedAt: "2026-09-16T12:00:00.000Z",
    reach: 1000,
    likes: 80,
    comments: 15,
    shares: 15,
    saves: 10,
    subject: "Seahawks"
  }),
  content({
    id: "baseline",
    publishedAt: "2026-09-15T12:00:00.000Z",
    reach: 1000,
    likes: 50,
    comments: 10,
    shares: 10,
    saves: 10,
    subject: "Studio"
  }),
  content({
    id: "under",
    publishedAt: "2026-09-14T12:00:00.000Z",
    reach: 1000,
    likes: 25,
    comments: 5,
    shares: 5,
    saves: 5,
    subject: "Studio"
  })
] as const;

test("Content DNA ranks normalized winners and underperformers only within a proven fresh platform", () => {
  const result = analyzeSocialContentDnaV1([snapshot({ contentRows: instagramRows })]);

  assert.equal(result.status, "READY");
  assert.deepEqual(result.analyzed_platforms, ["INSTAGRAM"]);
  assert.deepEqual(result.winner_ids, ["INSTAGRAM:winner"]);
  assert.deepEqual(result.underperformer_ids, ["INSTAGRAM:under"]);

  const winner = result.content.find((row) => row.content_id === "winner");
  assert.equal(winner?.engagement_per_1000_exposure, 150);
  assert.equal(winner?.business_outcome_ref_count, 1);
  assert.equal(winner?.attribution_confidence, "MODERATE");
  assert.ok((winner?.evidence_refs.length ?? 0) > 0);
  assert.equal(result.external_access_performed, false);
  assert.equal(result.writes_performed, false);
});

test("Content DNA emits evidence-backed attribute associations without causal claims", () => {
  const result = analyzeSocialContentDnaV1([snapshot({ contentRows: instagramRows })]);
  const seahawks = result.patterns.find((pattern) => pattern.dimension === "SUBJECT" && pattern.value === "Seahawks");

  assert.ok(seahawks);
  assert.equal(seahawks?.association, "ABOVE_PLATFORM_BASELINE");
  assert.equal(seahawks?.causal_claim, false);
  assert.equal(seahawks?.comparable_content_count, 2);
  assert.match(seahawks?.interpretation ?? "", /association, not a causal effect/);
  assert.ok((seahawks?.evidence_refs.length ?? 0) > 0);
});

test("zero-baseline Content DNA patterns stay JSON-safe without claiming an infinite multiplier", () => {
  const rows = [
    content({ id: "breakout", publishedAt: "2026-09-17T12:00:00.000Z", reach: 1000, likes: 100, comments: 0, shares: 0, saves: 0, subject: "Breakout" }),
    content({ id: "breakout-zero", publishedAt: "2026-09-16T12:00:00.000Z", reach: 1000, likes: 0, comments: 0, shares: 0, saves: 0, subject: "Breakout" }),
    content({ id: "zero-a", publishedAt: "2026-09-15T12:00:00.000Z", reach: 1000, likes: 0, comments: 0, shares: 0, saves: 0, subject: "Zero" }),
    content({ id: "zero-b", publishedAt: "2026-09-14T12:00:00.000Z", reach: 1000, likes: 0, comments: 0, shares: 0, saves: 0, subject: "Zero" })
  ];

  const result = analyzeSocialContentDnaV1([snapshot({ contentRows: rows })]);
  const breakout = result.patterns.find((pattern) => pattern.dimension === "SUBJECT" && pattern.value === "Breakout");

  assert.ok(breakout);
  assert.equal(breakout?.platform_median_engagement_per_1000_exposure, 0);
  assert.equal(breakout?.relative_to_platform_median, null);
  assert.equal(breakout?.association, "ABOVE_PLATFORM_BASELINE");
  assert.match(breakout?.interpretation ?? "", /relative magnitude undefined/);
  assert.doesNotMatch(breakout?.interpretation ?? "", /infinite|infinity/i);

  assertAllNumbersFinite(result);
  const serialized = JSON.stringify(result);
  assert.deepEqual(JSON.parse(serialized), result);
});

test("UNKNOWN metrics are never coerced to zero", () => {
  const rows = [
    ...instagramRows,
    content({
      id: "unknown",
      publishedAt: "2026-09-13T12:00:00.000Z",
      reach: null,
      likes: 100,
      comments: 10,
      shares: 5,
      saves: 2,
      subject: "Unknown reach"
    })
  ];
  const result = analyzeSocialContentDnaV1([snapshot({ contentRows: rows })]);
  const unknown = result.content.find((row) => row.content_id === "unknown");

  assert.equal(unknown?.engagement_per_1000_exposure, null);
  assert.equal(unknown?.high_intent_per_1000_exposure, null);
  assert.equal(unknown?.band, "INSUFFICIENT_EVIDENCE");
  assert.ok(unknown?.limitations.some((value) => value.includes("denominator")));
});

test("stale and unproven sources are excluded instead of masquerading as current performance", () => {
  const stale = snapshot({
    platform: "INSTAGRAM",
    accountId: "stale",
    lastSuccessfulSyncAt: "2026-09-10T00:00:00.000Z",
    contentRows: instagramRows
  });
  const scaffolded = snapshot({
    platform: "FACEBOOK",
    accountId: "not-connected",
    requestedState: "AVAILABLE_NEEDS_IMPLEMENTATION",
    lastSuccessfulSyncAt: null,
    contentRows: instagramRows
  });

  const result = analyzeSocialContentDnaV1([stale, scaffolded]);
  assert.equal(result.status, "INSUFFICIENT_EVIDENCE");
  assert.deepEqual(result.analyzed_platforms, []);
  assert.equal(result.content.length, 0);
  assert.equal(result.excluded_platforms.length, 2);
  assert.ok(result.excluded_platforms.some((entry) => entry.reason.includes("STALE")));
  assert.ok(result.excluded_platforms.some((entry) => entry.reason.includes("not proven connected")));
});

test("cross-platform performance is not merged into one baseline", () => {
  const facebookRows = [
    content({ id: "fb-1", publishedAt: "2026-09-17T10:00:00.000Z", reach: 1000, likes: 10, comments: 0, shares: 0, saves: 0, subject: "Seahawks" }),
    content({ id: "fb-2", publishedAt: "2026-09-16T10:00:00.000Z", reach: 1000, likes: 10, comments: 0, shares: 0, saves: 0, subject: "Seahawks" }),
    content({ id: "fb-3", publishedAt: "2026-09-15T10:00:00.000Z", reach: 1000, likes: 10, comments: 0, shares: 0, saves: 0, subject: "Studio" })
  ];

  const result = analyzeSocialContentDnaV1([
    snapshot({ platform: "INSTAGRAM", contentRows: instagramRows }),
    snapshot({ platform: "FACEBOOK", contentRows: facebookRows })
  ]);

  const igWinner = result.content.find((row) => row.platform === "INSTAGRAM" && row.content_id === "winner");
  const fbOne = result.content.find((row) => row.platform === "FACEBOOK" && row.content_id === "fb-1");
  assert.equal(igWinner?.band, "OBSERVED_WINNER");
  assert.equal(fbOne?.band, "WITHIN_BASELINE");
});

test("analysis is deterministic, bounded, and does not mutate canonical input", () => {
  const ig = snapshot({ contentRows: instagramRows });
  const fb = snapshot({ platform: "FACEBOOK", contentRows: [] });
  const before = JSON.stringify([ig, fb]);
  const first = analyzeSocialContentDnaV1([ig, fb]);
  const second = analyzeSocialContentDnaV1([fb, ig]);

  assert.deepEqual(first, second);
  assert.equal(JSON.stringify([ig, fb]), before);

  const tooMany = Array.from({ length: SOCIAL_CONTENT_DNA_MAX_SNAPSHOTS + 1 }, (_, index) =>
    snapshot({ accountId: `acct-${index}`, contentRows: [] })
  );
  assert.throws(() => analyzeSocialContentDnaV1(tooMany), /at most 20 snapshots/);
});
