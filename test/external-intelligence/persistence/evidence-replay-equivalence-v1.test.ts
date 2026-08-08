import test from "node:test";
import assert from "node:assert/strict";

import { canonicalJsonSha256Hex } from "@/lib/fusion-v1/canonical-json";
import {
  EVIDENCE_REPLAY_VOLATILE_PATHS_V1,
  normalizeEvidencePayloadForReplayEquivalenceV1
} from "@/lib/external-intelligence/persistence/evidence-replay-equivalence-v1";

test("EvidenceReference replay equivalence V1: allowlisted volatile paths are ignored", () => {
  assert.deepEqual(EVIDENCE_REPLAY_VOLATILE_PATHS_V1, [
    "retrieved_at",
    "provenance_metadata.collected_at",
    "provenance_metadata.rss_position"
  ]);

  const base = {
    evidence_reference_id: "ev_x",
    source_id: "sports_business.boardroom",
    source_config_version: "v1",
    source_set_id: null,
    source_artifact_identifier: null,
    source_url_or_reference: "https://boardroom.tv/example",
    content_hash: "c".repeat(64),
    retrieved_at: "2026-08-08T00:00:00.000Z",
    published_at: "2026-08-07T00:00:00.000Z",
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
      collected_at: "2026-08-08T00:00:00.000Z",
      rss_position: 0,
      title: "Same",
      published_at: "2026-08-07T00:00:00.000Z"
    },
    credibility: { level: "medium", bounded_score: null, reasons: ["publisher_rss"] },
    corroborating_evidence_reference_ids: [],
    contradicting_evidence_reference_ids: [],
    schema_version: "evidence_reference_v1"
  };

  const recollected = {
    ...base,
    retrieved_at: "2026-08-08T01:23:45.000Z",
    provenance_metadata: {
      ...base.provenance_metadata,
      collected_at: "2026-08-08T01:23:45.000Z",
      rss_position: 4
    }
  };

  const a = normalizeEvidencePayloadForReplayEquivalenceV1(base);
  const b = normalizeEvidencePayloadForReplayEquivalenceV1(recollected);

  assert.equal(canonicalJsonSha256Hex(a), canonicalJsonSha256Hex(b));
});

test("EvidenceReference replay equivalence V1: semantic drift is NOT ignored", () => {
  const base = {
    evidence_reference_id: "ev_x",
    source_id: "sports_business.boardroom",
    source_config_version: "v1",
    source_set_id: null,
    source_artifact_identifier: null,
    source_url_or_reference: "https://boardroom.tv/example",
    content_hash: "c".repeat(64),
    retrieved_at: "2026-08-08T00:00:00.000Z",
    published_at: "2026-08-07T00:00:00.000Z",
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
      collected_at: "2026-08-08T00:00:00.000Z",
      rss_position: 0,
      title: "Original Title"
    },
    credibility: { level: "medium", bounded_score: null, reasons: ["publisher_rss"] },
    corroborating_evidence_reference_ids: [],
    contradicting_evidence_reference_ids: [],
    schema_version: "evidence_reference_v1"
  };

  const drifted = {
    ...base,
    provenance_metadata: {
      ...base.provenance_metadata,
      title: "CHANGED TITLE"
    }
  };

  const a = normalizeEvidencePayloadForReplayEquivalenceV1(base);
  const b = normalizeEvidencePayloadForReplayEquivalenceV1(drifted);

  assert.notEqual(canonicalJsonSha256Hex(a), canonicalJsonSha256Hex(b));
});

