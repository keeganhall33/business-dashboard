import type { EvidenceEdge } from "@/lib/intelligence-v1/contracts";

import type { VersionRef } from "@/lib/external-intelligence/contracts/version-ref";
import { deepFreeze } from "@/lib/external-intelligence/config/freeze";
import { INTELLIGENCE_V1_ADAPTER_POLICY_REF } from "@/lib/external-intelligence/adapters/intelligence-v1/adapter-policy";

export type VersionedInternalEvidenceEdge = {
  edge: EvidenceEdge;
  from_ref: VersionRef;
  to_ref: VersionRef;
  adapter_policy: typeof INTELLIGENCE_V1_ADAPTER_POLICY_REF;
};

export function adaptInternalEvidenceEdgeToVersionedEdge(input: {
  edge: EvidenceEdge;
  findFindingRef: (finding_id: string) => VersionRef | null;
  findHypothesisRef: (hypothesis_id: string) => VersionRef | null;
  findFactRef: (fact_id: string) => VersionRef | null;
}): VersionedInternalEvidenceEdge {
  const e = input.edge;

  const resolve = (type: EvidenceEdge["from_type"] | EvidenceEdge["to_type"], id: string): VersionRef | null => {
    switch (type) {
      case "finding":
        return input.findFindingRef(id);
      case "hypothesis":
        return input.findHypothesisRef(id);
      case "fact":
        return input.findFactRef(id);
      default:
        return null;
    }
  };

  // Fail closed if we cannot immutably pin endpoints.
  const from_ref = resolve(e.from_type, e.from_id);
  const to_ref = resolve(e.to_type, e.to_id);
  if (!from_ref) throw new Error(`cannot pin from endpoint: ${e.from_type}:${e.from_id}`);
  if (!to_ref) throw new Error(`cannot pin to endpoint: ${e.to_type}:${e.to_id}`);

  const expectedType = (t: EvidenceEdge["from_type"] | EvidenceEdge["to_type"]) => {
    if (t === "fact") return "internal_fact";
    if (t === "finding") return "internal_finding";
    if (t === "hypothesis") return "internal_hypothesis";
    return null;
  };

  const expFrom = expectedType(e.from_type);
  const expTo = expectedType(e.to_type);
  if (expFrom && from_ref.object_type !== expFrom) {
    throw new Error(`from endpoint object_type mismatch: expected=${expFrom} got=${from_ref.object_type}`);
  }
  if (expTo && to_ref.object_type !== expTo) {
    throw new Error(`to endpoint object_type mismatch: expected=${expTo} got=${to_ref.object_type}`);
  }

  return deepFreeze({ edge: e, from_ref, to_ref, adapter_policy: INTELLIGENCE_V1_ADAPTER_POLICY_REF });
}
