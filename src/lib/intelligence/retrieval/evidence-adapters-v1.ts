import type { ExplanationEvidenceItem } from "@/lib/intelligence/explanation-contract";
import type { ExternalSignal } from "@/lib/external-intelligence/contracts/external-signal";
import type { EvidenceCandidateV1, EvidenceProvenanceV1 } from "./evidence-ranking-v1";

function failClosedProvenance(input: Partial<EvidenceProvenanceV1> & { sourceKey?: string }): EvidenceProvenanceV1 {
  return {
    authority: input.authority ?? "unknown",
    sourceKey: input.sourceKey ?? "unknown",
    provenanceComplete: input.provenanceComplete ?? false,
    independentCorroborationCount: input.independentCorroborationCount ?? 0,
    directness: input.directness ?? "unknown",
    freshness: input.freshness ?? { asOf: null },
    contradictionRisk: input.contradictionRisk ?? "unknown"
  };
}

export function explanationEvidenceItemToCandidateV1(item: ExplanationEvidenceItem): EvidenceCandidateV1 {
  // Explanation evidence is typically first-party telemetry, but keep mapping conservative.
  const sourceKey = String(item.source ?? "unknown");

  const provenance = failClosedProvenance({
    authority: sourceKey === "internal" || sourceKey === "supabase" ? "first_party" : sourceKey === "unknown" ? "unknown" : "first_party",
    sourceKey,
    provenanceComplete: false, // we do not have #229 completeness fields here; fail closed.
    independentCorroborationCount: 0,
    directness: item.kind === "metric" || item.kind === "timeseries" ? "direct" : "unknown",
    freshness: { asOf: null },
    contradictionRisk: "unknown"
  });

  return {
    id: item.id,
    label: item.label,
    summary: `Explanation evidence (${item.kind}) from ${sourceKey}`,
    provenance
  };
}

export function externalSignalToCandidateV1(signal: ExternalSignal): EvidenceCandidateV1 {
  // External signals can be official or independently reported; map conservatively.
  const authority =
    signal.signal_classification === "official"
      ? "official"
      : signal.signal_classification === "independently_reported" || signal.signal_classification === "single_source"
        ? "third_party"
        : "unknown";

  const provenance = failClosedProvenance({
    authority,
    sourceKey: "external-signal",
    provenanceComplete: false, // do not infer completeness across #229.
    independentCorroborationCount: Math.max(0, Number(signal.independent_source_count ?? 0) || 0),
    directness: "unknown",
    freshness: { asOf: signal.last_observed_at ?? null },
    contradictionRisk: signal.signal_classification === "rumor" ? "high" : "unknown"
  });

  return {
    id: signal.signal_id,
    label: signal.signal_type,
    summary: signal.normalized_statement,
    provenance
  };
}

