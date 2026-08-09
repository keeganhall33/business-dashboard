import test from "node:test";
import assert from "node:assert/strict";

import { __test__processBoardroomCollectedItemsV1, __test__getBoardroomDiscoveryMaxItemsV1, BOARDROOM_FILTERED_ONE_SHOT_DISCOVERY_LIMIT_V1 } from "@/lib/external-intelligence/orchestration/handlers/boardroom-collection-v1";
import { normalizeBoardroomOneShotFilter } from "@/lib/external-intelligence/orchestration/handlers/boardroom-one-shot-filter";

type FakeEvidence = {
  canonical_url: string;
  evidence_reference_id: string;
};

test("discovery max-items: scheduler remains 5", () => {
  assert.equal(
    __test__getBoardroomDiscoveryMaxItemsV1({ mode: "scheduler", has_explicit_non_empty_one_shot_filter: true }),
    5
  );
});

test("discovery max-items: unfiltered one-shot remains 5", () => {
  assert.equal(
    __test__getBoardroomDiscoveryMaxItemsV1({ mode: "one_shot", has_explicit_non_empty_one_shot_filter: false }),
    5
  );
});

test("discovery max-items: filtered one-shot uses bounded lookahead=20", () => {
  assert.equal(
    __test__getBoardroomDiscoveryMaxItemsV1({ mode: "one_shot", has_explicit_non_empty_one_shot_filter: true }),
    BOARDROOM_FILTERED_ONE_SHOT_DISCOVERY_LIMIT_V1
  );
  assert.equal(BOARDROOM_FILTERED_ONE_SHOT_DISCOVERY_LIMIT_V1, 20);
});

test("filtered lookahead: target at sorted position >5 can be selected; non-matches cannot cross persistence boundary", async () => {
  // Build 12 normalized items (already in the post-sort order). Put the target at sorted position 8.
  const collected_items = Array.from({ length: 12 }, (_, i) => ({
    canonical_url: `https://example.com/item-${String(i).padStart(2, "0")}`,
    guid: `g${i}`,
    title: `T${i}`,
    published_at_iso: null,
    author: null,
    categories: [],
    excerpt: null,
    rss_content_html: null
  }));

  const targetUrl = collected_items[8]?.canonical_url;
  assert.ok(targetUrl);

  const filter = normalizeBoardroomOneShotFilter({ evidence_reference_ids: ["ev_target"] });
  assert.ok(filter);

  const evidenceWrites: string[] = [];
  const qualifierCalls: string[] = [];

  const out = await __test__processBoardroomCollectedItemsV1({
    now_iso: new Date().toISOString(),
    mode: "one_shot",
    one_shot_filter: filter,
    collected_items,
    deps: {
      computeEvidenceReferenceId: ({ canonical_url }) => (canonical_url === targetUrl ? "ev_target" : "ev_other"),
      computeSourceItemId: ({ canonical_url }) => `src:${canonical_url}`,
      buildEvidenceReference: ({ canonical_url, evidence_reference_id }) =>
        ({ canonical_url, evidence_reference_id } satisfies FakeEvidence),
      createEvidenceRepo: () =>
        ({
          persistEvidenceReference: async ({ evidence }: { evidence: FakeEvidence }) => {
            evidenceWrites.push(evidence.canonical_url);
            return { ref: {} };
          }
        }) as unknown,
      qualifyDownstream: ({ evidence }: { evidence: FakeEvidence }) => {
        qualifierCalls.push(evidence.canonical_url);
        return { status: "not_qualified", reason_codes: ["no_explicit_partnership"], claims: [], sports_milestones: [] } as const;
      },
      createClaimRepo: () => ({ persistClaim: async () => {} }) as unknown
    }
  });

  assert.equal(out.selection.selected_items, 1);
  assert.equal(out.selection.skipped_items, 11);
  assert.deepEqual(evidenceWrites, [targetUrl]);
  assert.deepEqual(qualifierCalls, [targetUrl]);
});

test("production-shaped cohort: filtered one-shot can select 5 targets at sorted positions 6/7/13/17/18 within a 20-item discovery window", async () => {
  // Make 20 items (already in post-sort order). Targets are at positions 6,7,13,17,18.
  const collected_items = Array.from({ length: 20 }, (_, i) => ({
    canonical_url: `https://example.com/sorted-${String(i).padStart(2, "0")}`,
    guid: `g${i}`,
    title: `T${i}`,
    published_at_iso: null,
    author: null,
    categories: [],
    excerpt: null,
    rss_content_html: null
  }));

  const targets = new Map<number, string>([
    [6, "ev_new_1"],
    [7, "ev_new_2"],
    [13, "ev_new_3"],
    [17, "ev_new_4"],
    [18, "ev_new_5"]
  ]);

  const filter = normalizeBoardroomOneShotFilter({ evidence_reference_ids: Array.from(targets.values()) });
  assert.ok(filter);

  const evidenceWrites: string[] = [];

  const out = await __test__processBoardroomCollectedItemsV1({
    now_iso: new Date().toISOString(),
    mode: "one_shot",
    one_shot_filter: filter,
    collected_items,
    deps: {
      computeEvidenceReferenceId: ({ canonical_url }) => {
        const idx = Number(canonical_url.split("-").pop());
        return targets.get(idx) ?? "ev_other";
      },
      computeSourceItemId: ({ canonical_url }) => `src:${canonical_url}`,
      buildEvidenceReference: ({ canonical_url, evidence_reference_id }) =>
        ({ canonical_url, evidence_reference_id } satisfies FakeEvidence),
      createEvidenceRepo: () =>
        ({
          persistEvidenceReference: async ({ evidence }: { evidence: FakeEvidence }) => {
            evidenceWrites.push(evidence.evidence_reference_id);
            return { ref: {} };
          }
        }) as unknown,
      qualifyDownstream: () => ({ status: "not_qualified", reason_codes: ["no_explicit_partnership"], claims: [], sports_milestones: [] } as const),
      createClaimRepo: () => ({ persistClaim: async () => {} }) as unknown
    }
  });

  assert.equal(out.selection.selected_items, 5);
  assert.equal(out.observability_v1.collection.fetched_items, 20);
  assert.equal(out.observability_v1.collection.selected_items, 5);
  assert.equal(out.observability_v1.collection.skipped_items, 15);

  // Ensure ONLY the 5 allowlisted ids were persisted.
  assert.equal(evidenceWrites.length, 5);
  assert.deepEqual(new Set(evidenceWrites), new Set(targets.values()));
});

test("hard bound behavior: filtered lookahead cannot see items outside its bounded discovery window", async () => {
  // If the feed truncation happens at 20 items, a target at position 25 is not present.
  const collected_items = Array.from({ length: 20 }, (_, i) => ({
    canonical_url: `https://example.com/sorted-${String(i).padStart(2, "0")}`,
    guid: `g${i}`,
    title: `T${i}`,
    published_at_iso: null,
    author: null,
    categories: [],
    excerpt: null,
    rss_content_html: null
  }));

  const filter = normalizeBoardroomOneShotFilter({ evidence_reference_ids: ["ev_pos_25"] });
  assert.ok(filter);

  let evidenceWrites = 0;
  const out = await __test__processBoardroomCollectedItemsV1({
    now_iso: new Date().toISOString(),
    mode: "one_shot",
    one_shot_filter: filter,
    collected_items,
    deps: {
      computeEvidenceReferenceId: () => "ev_other",
      computeSourceItemId: ({ canonical_url }) => `src:${canonical_url}`,
      buildEvidenceReference: ({ canonical_url, evidence_reference_id }) =>
        ({ canonical_url, evidence_reference_id } satisfies FakeEvidence),
      createEvidenceRepo: () =>
        ({
          persistEvidenceReference: async () => {
            evidenceWrites += 1;
            return { ref: {} };
          }
        }) as unknown,
      qualifyDownstream: () => ({ status: "not_qualified", reason_codes: [], claims: [], sports_milestones: [] } as const),
      createClaimRepo: () => ({ persistClaim: async () => {} }) as unknown
    }
  });

  assert.equal(out.selection.selected_items, 0);
  assert.equal(evidenceWrites, 0);
});
