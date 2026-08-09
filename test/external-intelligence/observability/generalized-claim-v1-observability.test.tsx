import test from "node:test";
import assert from "node:assert/strict";

import { __test__processBoardroomCollectedItemsV1 } from "@/lib/external-intelligence/orchestration/handlers/boardroom-collection-v1";

type MinimalEvidenceRepo = {
  persistEvidenceReference: (input: unknown) => Promise<{
    ref: unknown;
    created_new_version: boolean;
    idempotent_replay: boolean;
  }>;
  getVersion?: (ref: unknown) => Promise<{ payload_available: boolean; payload_json: unknown }>;
};

type MinimalClaimRepo = {
  persistClaim: (input: unknown) => Promise<{ ref: unknown; created_new_version: boolean; idempotent_replay: boolean }>;
};

test("observability v1: boardroom BR-1-shaped semantic replay reports replays (not new versions)", async () => {
  const out = await __test__processBoardroomCollectedItemsV1({
    now_iso: "2026-08-09T00:00:00.000Z",
    mode: "one_shot",
    one_shot_filter: { evidence_reference_ids: ["ev_2623049899a3bd37abf05087"], canonical_urls: [] },
    collected_items: [
      {
        canonical_url: "https://boardroom.tv/a24-ai-google-deepmind-movies-films/",
        guid: null,
        title: "t",
        published_at_iso: null,
        author: null,
        categories: [],
        excerpt: "A24’s $75 million partnership with Google’s DeepMind ...",
        rss_content_html: null
      },
      // 4 non-matching items: skipped by filter.
      ...Array.from({ length: 4 }).map((_, i) => ({
        canonical_url: `https://boardroom.tv/other-${i}`,
        guid: null,
        title: "t",
        published_at_iso: null,
        author: null,
        categories: [],
        excerpt: "nope",
        rss_content_html: null
      }))
    ],
    deps: {
      computeEvidenceReferenceId: ({ canonical_url }: { canonical_url: string }) =>
        canonical_url.includes("a24-ai-google-deepmind") ? "ev_2623049899a3bd37abf05087" : `ev_other_${canonical_url}`,
      computeSourceItemId: () => "sid",
      buildEvidenceReference: (x: unknown) => {
        const xi = x as Record<string, unknown>;
        return {
          ...xi,
          evidence_reference_id: xi.evidence_reference_id,
          source_id: "sports_business.boardroom",
          source_config_version: "v1",
          source_set_id: "set",
          source_artifact_identifier: null,
          source_url_or_reference: xi.canonical_url,
          content_hash: "h",
          retrieved_at: "2026-08-08T21:05:01.289Z",
          published_at: null,
          event_time: null,
          evidence_type: "article",
          access_classification: "public",
          legal_policy_version: "boardroom.rss.link_only.v1",
          retention_policy: "link_only",
          excerpt_or_summary_reference: null,
          source_credibility_prior: "high",
          correction_status: "none",
          retraction_status: "none",
          supersedes_evidence_reference_id: null,
          schema_version: "evidence_reference_v1",
          provenance_metadata: { title: xi.title, excerpt: xi.excerpt }
        };
      },
      createEvidenceRepo: () =>
        ({
          persistEvidenceReference: async () => ({
            ref: {
              object_type: "evidence_reference",
              object_id: "ev_2623049899a3bd37abf05087",
              version_id: null,
              content_hash: "463baab27cbd229d2ef552a89f69e61c7c52e3e5318af48d258ef4a7cc66822f",
              schema_version: "evidence_reference_v1",
              policy_version: "boardroom.rss.link_only.v1",
              created_at: "2026-08-08T21:05:49.050196+00:00"
            },
            created_new_version: false,
            idempotent_replay: true
          }),
          // getVersion returns persisted payload (required for recollection determinism)
          getVersion: async () => ({ payload_available: true, payload_json: { dummy: true, legal_policy_version: "boardroom.rss.link_only.v1" } })
        }) as unknown as MinimalEvidenceRepo,
      qualifyDownstream: () =>
        ({
          status: "qualified",
          reason_codes: [],
          claims: [
            {
              claim_id: "cl_aeff8c0fc82472845b1e758d",
              claim_fingerprint: "fp",
              schema_version: "generalized_claim_v1",
              interpretation_policy_version: "generalized_claim_v1.partnered_with.deterministic.v1",
              retrieved_at: "2026-08-08T21:05:01.289Z",
              subject: { entity_id: "e1", entity_type: "organization", canonical_name: "A24", confidence: { level: "high" } },
              predicate: "partnered_with",
              object: { entity: { entity_id: "e2", entity_type: "organization", canonical_name: "Google DeepMind", confidence: { level: "high" } } },
              extraction_confidence: { level: "high" },
              verification_state: "unverified",
              event_time: null,
              announcement_time: null,
              evidence_reference_id: "ev_2623049899a3bd37abf05087"
            }
          ],
          sports_milestones: []
        }) as unknown,
      createClaimRepo: () =>
        ({
          persistClaim: async () => ({
            ref: { object_type: "claim", object_id: "cl_aeff8c0fc82472845b1e758d", version_id: null, content_hash: "x", schema_version: "generalized_claim_v1", policy_version: "ph", created_at: "t" },
            created_new_version: false,
            idempotent_replay: true
          })
        }) as unknown as MinimalClaimRepo
    }
  });

  assert.equal(out.selection.selected_items, 1);
  assert.equal(out.selection.skipped_items, 4);
  assert.equal(out.observability_v1.collection.fetched_items, 5);
  assert.equal(out.observability_v1.collection.selected_items, 1);
  assert.equal(out.observability_v1.collection.skipped_items, 4);

  assert.equal(out.observability_v1.evidence.processed, 1);
  assert.equal(out.observability_v1.evidence.new_versions, 0);
  assert.equal(out.observability_v1.evidence.idempotent_replays, 1);

  assert.equal(out.observability_v1.qualification.processed, 1);
  assert.equal(out.observability_v1.qualification.qualified, 1);
  assert.equal(out.observability_v1.qualification.not_qualified, 0);

  assert.equal(out.observability_v1.claims.proposed, 1);
  assert.equal(out.observability_v1.claims.persistence_attempts, 1);
  assert.equal(out.observability_v1.claims.new_versions, 0);
  assert.equal(out.observability_v1.claims.idempotent_replays, 1);
});

test("observability v1: no-match filter yields 0 selected and bounded success counters", async () => {
  const out = await __test__processBoardroomCollectedItemsV1({
    now_iso: "2026-08-09T00:00:00.000Z",
    mode: "one_shot",
    one_shot_filter: { evidence_reference_ids: ["ev_missing"], canonical_urls: [] },
    collected_items: [
      {
        canonical_url: "https://boardroom.tv/a",
        guid: null,
        title: "t",
        published_at_iso: null,
        author: null,
        categories: [],
        excerpt: "nope",
        rss_content_html: null
      }
    ],
    deps: {
      computeEvidenceReferenceId: () => "ev_other",
      computeSourceItemId: () => "sid",
      buildEvidenceReference: () => {
        throw new Error("should not build evidence when selected_items=0");
      },
      createEvidenceRepo: () => ({ persistEvidenceReference: async () => {
        throw new Error("should not persist evidence when selected_items=0");
      } }) as unknown as MinimalEvidenceRepo,
      createClaimRepo: () => ({ persistClaim: async () => {
        throw new Error("should not persist claims when selected_items=0");
      } }) as unknown as MinimalClaimRepo
    }
  });

  assert.equal(out.selection.selected_items, 0);
  assert.equal(out.selection.skipped_items, 1);
  assert.equal(out.observability_v1.collection.fetched_items, 1);
  assert.equal(out.observability_v1.collection.selected_items, 0);
  assert.equal(out.observability_v1.collection.skipped_items, 1);
  assert.equal(out.observability_v1.evidence.processed, 0);
  assert.equal(out.observability_v1.claims.proposed, 0);
});

test("observability v1: aggregates not_qualified reason codes", async () => {
  const out = await __test__processBoardroomCollectedItemsV1({
    now_iso: "2026-08-09T00:00:00.000Z",
    mode: "scheduler",
    one_shot_filter: null,
    collected_items: [
      {
        canonical_url: "https://boardroom.tv/a",
        guid: null,
        title: "t",
        published_at_iso: null,
        author: null,
        categories: [],
        excerpt: "no partnership",
        rss_content_html: null
      },
      {
        canonical_url: "https://boardroom.tv/b",
        guid: null,
        title: "t",
        published_at_iso: null,
        author: null,
        categories: [],
        excerpt: "no partnership",
        rss_content_html: null
      }
    ],
    deps: {
      computeEvidenceReferenceId: ({ canonical_url }: { canonical_url: string }) => `ev_${canonical_url.slice(-1)}`,
      computeSourceItemId: () => "sid",
      buildEvidenceReference: (x: unknown) => {
        const xi = x as Record<string, unknown>;
        return {
          ...xi,
        source_id: "sports_business.boardroom",
        source_config_version: "v1",
        source_set_id: "set",
        source_artifact_identifier: null,
        source_url_or_reference: xi.canonical_url,
        content_hash: "h",
        retrieved_at: "t",
        published_at: null,
        event_time: null,
        evidence_type: "article",
        access_classification: "public",
        legal_policy_version: "boardroom.rss.link_only.v1",
        retention_policy: "link_only",
        excerpt_or_summary_reference: null,
        source_credibility_prior: "high",
        correction_status: "none",
        retraction_status: "none",
        supersedes_evidence_reference_id: null,
        schema_version: "evidence_reference_v1",
        provenance_metadata: { title: xi.title, excerpt: xi.excerpt }
        };
      },
      createEvidenceRepo: () =>
        ({
          persistEvidenceReference: async () => ({
            ref: { object_type: "evidence_reference", object_id: "ev", version_id: null, content_hash: "h", schema_version: "evidence_reference_v1", policy_version: "boardroom.rss.link_only.v1", created_at: "t" },
            created_new_version: true,
            idempotent_replay: false
          }),
          getVersion: async () => ({ payload_available: false, payload_json: null })
        }) as unknown as MinimalEvidenceRepo,
      qualifyDownstream: () => ({ status: "not_qualified", reason_codes: ["no_explicit_partnership"], claims: [], sports_milestones: [] }) as unknown,
      createClaimRepo: () => ({ persistClaim: async () => ({ ref: null, created_new_version: false, idempotent_replay: false }) }) as unknown as MinimalClaimRepo
    }
  });

  assert.equal(out.observability_v1.qualification.processed, 2);
  assert.equal(out.observability_v1.qualification.not_qualified, 2);
  assert.equal(out.observability_v1.qualification.reason_codes.no_explicit_partnership, 2);
});
