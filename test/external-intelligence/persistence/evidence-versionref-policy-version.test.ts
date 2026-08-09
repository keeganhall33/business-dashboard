import test from "node:test";
import assert from "node:assert/strict";

import { __test__createEvidenceReferenceVersionRef } from "@/lib/external-intelligence/persistence/supabase/evidence-reference.repository";

test("EvidenceReference VersionRef policy_version is pinned to persisted legal_policy_version (not lane policy)", () => {
  // Production-shaped BR-1 values.
  const ref = __test__createEvidenceReferenceVersionRef({
    evidence_reference_id: "ev_2623049899a3bd37abf05087",
    content_hash: "463baab27cbd229d2ef552a89f69e61c7c52e3e5318af48d258ef4a7cc66822f",
    schema_version: "evidence_reference_v1",
    legal_policy_version: "boardroom.rss.link_only.v1",
    created_at_iso: "2026-08-08T21:05:49.050196+00:00"
  });

  assert.equal(ref.object_type, "evidence_reference");
  assert.equal(ref.object_id, "ev_2623049899a3bd37abf05087");
  assert.equal(ref.content_hash, "463baab27cbd229d2ef552a89f69e61c7c52e3e5318af48d258ef4a7cc66822f");
  assert.equal(ref.schema_version, "evidence_reference_v1");
  assert.equal(ref.policy_version, "boardroom.rss.link_only.v1");
  assert.equal(ref.created_at, "2026-08-08T21:05:49.050196+00:00");
});

test("EvidenceReference VersionRef policy_version matches Hoophall evidence legal_policy_version (not lane policy)", () => {
  // Hoophall-shaped values: lane policy is b6.hoophall.deterministic.v1, but evidence legal policy is link_only.
  const ref = __test__createEvidenceReferenceVersionRef({
    evidence_reference_id: "ev_hoophall_example",
    content_hash: "a".repeat(64),
    schema_version: "evidence_reference_v1",
    legal_policy_version: "b6.hoophall.link_only.v1",
    created_at_iso: "2026-08-08T00:00:00.000Z"
  });

  assert.equal(ref.object_type, "evidence_reference");
  assert.equal(ref.policy_version, "b6.hoophall.link_only.v1");
});
