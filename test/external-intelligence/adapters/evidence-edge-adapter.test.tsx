import test from "node:test";
import assert from "node:assert/strict";

import { adaptInternalEvidenceEdgeToVersionedEdge } from "@/lib/external-intelligence/adapters/intelligence-v1/evidence-edge.adapter";
import type { ObjectType } from "@/lib/external-intelligence/contracts/enums";
import type { EvidenceEdge } from "@/lib/intelligence-v1/contracts";

const mkRef = (object_type: ObjectType, object_id: string) => ({
  object_type,
  object_id,
  version_id: null,
  content_hash: "a".repeat(64),
  schema_version: "v1",
  policy_version: "p1",
  created_at: new Date().toISOString()
});

test("EvidenceEdge adapter fails closed when endpoints cannot be pinned", () => {
  assert.throws(() =>
    adaptInternalEvidenceEdgeToVersionedEdge({
      edge: {
        from_type: "recommendation",
        from_id: "r1",
        to_type: "finding",
        to_id: "f1",
        relation: "supports",
        weight: 1,
        note: null
      } as unknown as EvidenceEdge,
      findFindingRef: () => mkRef("finding", "f1"),
      findHypothesisRef: () => null,
      findFactRef: () => null
    })
  );
});

test("EvidenceEdge adapter pins endpoints for finding->fact", () => {
  const out = adaptInternalEvidenceEdgeToVersionedEdge({
    edge: {
      from_type: "finding",
      from_id: "f1",
      to_type: "fact",
      to_id: "m1",
      relation: "supports",
      weight: 1,
      note: null
    } as unknown as EvidenceEdge,
    findFindingRef: (id) => mkRef("internal_finding", id),
    findHypothesisRef: () => null,
    findFactRef: (id) => mkRef("internal_fact", id)
  });

  assert.equal(out.from_ref.object_id, "f1");
  assert.equal(out.to_ref.object_id, "m1");
});

test("EvidenceEdge adapter rejects resolver returning wrong endpoint object_type", () => {
  assert.throws(() =>
    adaptInternalEvidenceEdgeToVersionedEdge({
      edge: {
        from_type: "finding",
        from_id: "f1",
        to_type: "fact",
        to_id: "m1",
        relation: "supports",
        weight: 1,
        note: null
      } as unknown as EvidenceEdge,
      // Wrong: finding resolver returns internal_hypothesis
      findFindingRef: (id) => mkRef("internal_hypothesis", id),
      findHypothesisRef: () => null,
      findFactRef: (id) => mkRef("internal_fact", id)
    })
  );
});
