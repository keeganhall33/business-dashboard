import type { EvidenceEdge, FactRef, Finding, Hypothesis } from "@/lib/intelligence-v1/contracts";
import type { Recommendation } from "@/lib/intelligence/recommendation-contract";

export function buildTrafficQualityEvidenceEdges(input: {
  finding: Finding;
  hypotheses: Hypothesis[];
  recommendation: Recommendation;
  factIdByMetricId: Record<string, string | undefined>;
}): EvidenceEdge[] {
  const edges: EvidenceEdge[] = [];
  const factId = (f: FactRef) => input.factIdByMetricId[f.metric_id];

  for (const f of input.finding.facts_primary ?? []) {
    const id = factId(f);
    if (!id) continue;
    edges.push({
      from_type: "finding",
      from_id: input.finding.finding_id,
      to_type: "fact",
      to_id: id,
      relation: "derived_from",
      weight: 1,
      note: f.metric_id
    });
  }

  for (const f of input.finding.evidence_for ?? []) {
    const id = factId(f);
    if (!id) continue;
    edges.push({
      from_type: "finding",
      from_id: input.finding.finding_id,
      to_type: "fact",
      to_id: id,
      relation: "supports",
      weight: 1,
      note: f.metric_id
    });
  }

  for (const f of input.finding.evidence_against ?? []) {
    const id = factId(f);
    if (!id) continue;
    edges.push({
      from_type: "finding",
      from_id: input.finding.finding_id,
      to_type: "fact",
      to_id: id,
      relation: "contradicts",
      weight: 1,
      note: f.metric_id
    });
  }

  for (const h of input.hypotheses ?? []) {
    edges.push({
      from_type: "hypothesis",
      from_id: h.hypothesis_id,
      to_type: "finding",
      to_id: input.finding.finding_id,
      relation: "derived_from",
      weight: 1,
      note: null
    });

    for (const f of h.evidence_for ?? []) {
      const id = factId(f);
      if (!id) continue;
      edges.push({
        from_type: "hypothesis",
        from_id: h.hypothesis_id,
        to_type: "fact",
        to_id: id,
        relation: "supports",
        weight: 1,
        note: f.metric_id
      });
    }
    for (const f of h.evidence_against ?? []) {
      const id = factId(f);
      if (!id) continue;
      edges.push({
        from_type: "hypothesis",
        from_id: h.hypothesis_id,
        to_type: "fact",
        to_id: id,
        relation: "contradicts",
        weight: 1,
        note: f.metric_id
      });
    }
  }

  edges.push({
    from_type: "recommendation",
    from_id: input.recommendation.id,
    to_type: "finding",
    to_id: input.finding.finding_id,
    relation: "depends_on",
    weight: 1,
    note: null
  });
  for (const h of input.hypotheses ?? []) {
    edges.push({
      from_type: "recommendation",
      from_id: input.recommendation.id,
      to_type: "hypothesis",
      to_id: h.hypothesis_id,
      relation: "depends_on",
      weight: 1,
      note: null
    });
  }

  return edges;
}

