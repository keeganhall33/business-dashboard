import test from "node:test";
import assert from "node:assert/strict";

import { __test__processBoardroomCollectedItemsV1 } from "@/lib/external-intelligence/orchestration/handlers/boardroom-collection-v1";
import type { EvidenceReference } from "@/lib/external-intelligence/contracts/evidence-reference";
import type { VersionRef } from "@/lib/external-intelligence/contracts/version-ref";
import type { EvidenceReferenceRepository } from "@/lib/external-intelligence/persistence/supabase/evidence-reference.repository";
import type { ClaimRepository } from "@/lib/external-intelligence/persistence/supabase/claim.repository";

test("Boardroom recollection: downstream qualification uses persisted evidence payload (claim replay idempotency)", async () => {
  const now_iso = "2026-08-08T12:00:00.000Z";
  const earlier_iso = "2026-08-08T10:00:00.000Z";

  const ref: VersionRef = {
    object_type: "evidence_reference",
    object_id: "ev_2623049899a3bd37abf05087",
    version_id: null,
    content_hash: "h".repeat(64),
    schema_version: "evidence_reference_v1",
    policy_version: "boardroom.rss.v1",
    created_at: earlier_iso
  };

  const persistedEvidence: EvidenceReference = {
    schema_version: "evidence_reference_v1",
    evidence_reference_id: ref.object_id,
    source_id: "sports_business.boardroom",
    source_config_version: "v1",
    source_set_id: null,
    source_artifact_identifier: null,
    source_url_or_reference: "https://boardroom.tv/example",
    content_hash: "c".repeat(64),
    retrieved_at: earlier_iso,
    published_at: null,
    event_time: null,
    evidence_type: "report",
    access_classification: "public",
    legal_policy_version: "boardroom.rss.link_only.v1",
    retention_policy: "link_only",
    excerpt_or_summary_reference: null,
    source_credibility_prior: "medium",
    correction_status: "none",
    retraction_status: "none",
    supersedes_evidence_reference_id: null,
    provenance_metadata: {
      title: "A24 Built Its Brand on Artists; Now It's Betting on AI",
      excerpt: "A24's partnership with Google's DeepMind..."
    },
    credibility: { level: "medium", bounded_score: null, reasons: [] },
    corroborating_evidence_reference_ids: [],
    contradicting_evidence_reference_ids: []
  };

  let observedClaimRetrievedAt: string | null = null;

  await __test__processBoardroomCollectedItemsV1({
    now_iso,
    mode: "one_shot",
    one_shot_filter: { mode: "by_evidence_reference_id", evidence_reference_ids: [ref.object_id] },
    collected_items: [
      {
        canonical_url: "https://boardroom.tv/example",
        guid: null,
        title: "ignored",
        published_at_iso: null,
        author: null,
        categories: [],
        excerpt: null,
        rss_content_html: null
      }
    ],
    deps: {
      computeEvidenceReferenceId: () => ref.object_id,
      computeSourceItemId: () => "url:https://boardroom.tv/example",
      buildEvidenceReference: (input: { collected_at_iso: string }) => ({
        ...persistedEvidence,
        // Simulate recollection producing a fresh occurrence timestamp.
        retrieved_at: input.collected_at_iso,
        provenance_metadata: { ...persistedEvidence.provenance_metadata, collected_at: input.collected_at_iso }
      }),
      createEvidenceRepo: () =>
        ({
          persistEvidenceReference: async () => ({ ref, created_new_version: false, idempotent_replay: true }),
          getVersion: async () => ({
            ref,
            payload_available: true,
            payload_json: persistedEvidence
          })
        }) as unknown as EvidenceReferenceRepository,
      createClaimRepo: () =>
        ({
          persistClaim: async (input: unknown) => {
            const i = input as { claim: { retrieved_at: string; claim_id: string } };
            observedClaimRetrievedAt = i.claim.retrieved_at;
            return {
              ref: {
                object_type: "claim",
                object_id: i.claim.claim_id,
                version_id: null,
                content_hash: "x",
                schema_version: "claim_v1",
                policy_version: "p",
                created_at: now_iso
              },
              created_new_version: false,
              idempotent_replay: true
            };
          }
        }) as unknown as ClaimRepository
    }
  });

  assert.equal(observedClaimRetrievedAt, earlier_iso);
});
