import test from "node:test";
import assert from "node:assert/strict";

import { __test__processBoardroomCollectedItemsV1 } from "@/lib/external-intelligence/orchestration/handlers/boardroom-collection-v1";
import { normalizeBoardroomOneShotFilter } from "@/lib/external-intelligence/orchestration/handlers/boardroom-one-shot-filter";

type FakeEvidence = {
  canonical_url: string;
  evidence_reference_id: string;
  title?: string;
};

type FakeEvidencePersistResult = {
  ref: {
    object_type: "evidence_reference";
    object_id: string;
    version_id: null;
    content_hash: string;
    schema_version: string;
    policy_version: string;
    created_at: string;
  };
};

test("handler isolation: one-shot filter allows ONLY BR-1; non-matching items cannot cross persistence boundary", async () => {
  const collected_items = [
    {
      canonical_url: "https://example.com/br-1",
      guid: "g1",
      title: "BR-1",
      published_at_iso: null,
      author: null,
      categories: [],
      excerpt: "A24 partnership with DeepMind",
      rss_content_html: null
    },
    {
      canonical_url: "https://example.com/br-2",
      guid: "g2",
      title: "BR-2",
      published_at_iso: null,
      author: null,
      categories: [],
      excerpt: "not relevant",
      rss_content_html: null
    },
    {
      canonical_url: "https://example.com/br-3",
      guid: "g3",
      title: "BR-3",
      published_at_iso: null,
      author: null,
      categories: [],
      excerpt: "not relevant",
      rss_content_html: null
    }
  ];

  const filter = normalizeBoardroomOneShotFilter({ evidence_reference_ids: ["ev_br1"] });
  assert.ok(filter);

  const evidenceWrites: string[] = [];
  const claimWrites: string[] = [];
  const qualifierCalls: string[] = [];

  const out = await __test__processBoardroomCollectedItemsV1({
    now_iso: new Date().toISOString(),
    mode: "one_shot",
    one_shot_filter: filter,
    collected_items,
    deps: {
      computeEvidenceReferenceId: ({ canonical_url }) =>
        canonical_url === "https://example.com/br-1" ? "ev_br1" : "ev_other",
      computeSourceItemId: ({ canonical_url }) => `src:${canonical_url}`,
      buildEvidenceReference: ({ canonical_url, evidence_reference_id, title }) =>
        ({ canonical_url, evidence_reference_id, title } satisfies FakeEvidence),
      createEvidenceRepo: () =>
        ({
          persistEvidenceReference: async ({ evidence }: { evidence: FakeEvidence }) => {
            evidenceWrites.push(String(evidence.canonical_url));
            const res: FakeEvidencePersistResult = {
              ref: {
                object_type: "evidence_reference",
                object_id: evidence.evidence_reference_id,
                version_id: null,
                content_hash: "h",
                schema_version: "evidence_reference_v1",
                policy_version: "p",
                created_at: new Date().toISOString()
              }
            };
            return res;
          }
        }) as unknown,
      qualifyDownstream: ({ evidence }: { evidence: FakeEvidence }) => {
        qualifierCalls.push(String(evidence.canonical_url));
        return { status: "not_qualified", reason_codes: ["x"], claims: [], sports_milestones: [] } as const;
      },
      createClaimRepo: () =>
        ({
          persistClaim: async ({ claim }: { claim: { claim_id?: string } }) => {
            claimWrites.push(String(claim.claim_id ?? "unknown"));
          }
        }) as unknown
    }
  });

  assert.equal(out.selection.selected_items, 1);
  assert.equal(out.selection.skipped_items, 2);

  assert.deepEqual(evidenceWrites, ["https://example.com/br-1"]);
  assert.deepEqual(qualifierCalls, ["https://example.com/br-1"]);
  assert.deepEqual(claimWrites, []);
});

test("no-match: valid filter with no matching items produces bounded zero-selection with zero writes", async () => {
  const collected_items = [
    {
      canonical_url: "https://example.com/br-1",
      guid: "g1",
      title: "BR-1",
      published_at_iso: null,
      author: null,
      categories: [],
      excerpt: "x",
      rss_content_html: null
    },
    {
      canonical_url: "https://example.com/br-2",
      guid: "g2",
      title: "BR-2",
      published_at_iso: null,
      author: null,
      categories: [],
      excerpt: "y",
      rss_content_html: null
    }
  ];

  const filter = normalizeBoardroomOneShotFilter({ evidence_reference_ids: ["ev_does_not_exist"] });
  assert.ok(filter);

  let evidenceWrites = 0;
  let qualifierCalls = 0;
  let claimWrites = 0;

  const out = await __test__processBoardroomCollectedItemsV1({
    now_iso: new Date().toISOString(),
    mode: "one_shot",
    one_shot_filter: filter,
    collected_items,
    deps: {
      computeEvidenceReferenceId: ({ canonical_url }) => `ev:${canonical_url}`,
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
      qualifyDownstream: () => {
        qualifierCalls += 1;
        return { status: "not_qualified", reason_codes: [], claims: [], sports_milestones: [] } as const;
      },
      createClaimRepo: () => ({ persistClaim: async () => { claimWrites += 1; } }) as unknown
    }
  });

  assert.equal(out.selection.selected_items, 0);
  assert.equal(evidenceWrites, 0);
  assert.equal(qualifierCalls, 0);
  assert.equal(claimWrites, 0);
});

test("absent filter: one-shot legacy behavior is unchanged (processes all items)", async () => {
  const collected_items = [
    {
      canonical_url: "https://example.com/br-1",
      guid: "g1",
      title: "BR-1",
      published_at_iso: null,
      author: null,
      categories: [],
      excerpt: "x",
      rss_content_html: null
    },
    {
      canonical_url: "https://example.com/br-2",
      guid: "g2",
      title: "BR-2",
      published_at_iso: null,
      author: null,
      categories: [],
      excerpt: "y",
      rss_content_html: null
    }
  ];

  let evidenceWrites = 0;
  const out = await __test__processBoardroomCollectedItemsV1({
    now_iso: new Date().toISOString(),
    mode: "one_shot",
    one_shot_filter: null,
    collected_items,
    deps: {
      computeEvidenceReferenceId: ({ canonical_url }) => `ev:${canonical_url}`,
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

  assert.equal(out.selection.selected_items, 2);
  assert.equal(evidenceWrites, 2);
});

test("scheduler isolation: scheduler mode ignores one-shot filter", async () => {
  const collected_items = [
    {
      canonical_url: "https://example.com/br-1",
      guid: "g1",
      title: "BR-1",
      published_at_iso: null,
      author: null,
      categories: [],
      excerpt: "x",
      rss_content_html: null
    },
    {
      canonical_url: "https://example.com/br-2",
      guid: "g2",
      title: "BR-2",
      published_at_iso: null,
      author: null,
      categories: [],
      excerpt: "y",
      rss_content_html: null
    }
  ];

  const filter = normalizeBoardroomOneShotFilter({ evidence_reference_ids: ["ev_br1"] });
  assert.ok(filter);

  let evidenceWrites = 0;
  const out = await __test__processBoardroomCollectedItemsV1({
    now_iso: new Date().toISOString(),
    mode: "scheduler",
    one_shot_filter: filter,
    collected_items,
    deps: {
      computeEvidenceReferenceId: ({ canonical_url }) =>
        canonical_url === "https://example.com/br-1" ? "ev_br1" : "ev_other",
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

  assert.equal(out.selection.selected_items, 2);
  assert.equal(evidenceWrites, 2);
});
