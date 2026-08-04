import type { FusionConfidence } from "@/lib/fusion-v1/contracts";

export function normalizeConfidenceTo01(conf: FusionConfidence): {
  normalized: number;
  mapping: string;
} {
  if (conf.system === "intelligence_v1") {
    if (typeof conf.score === "number" && Number.isFinite(conf.score)) {
      return { normalized: Math.max(0, Math.min(1, conf.score)), mapping: "intelligence_v1.score passthrough" };
    }
    const map: Record<string, number> = {
      confirmed: 0.9,
      strongly_supported: 0.8,
      likely: 0.65,
      possible: 0.45,
      insufficient_evidence: 0.2
    };
    return { normalized: map[conf.level] ?? 0.2, mapping: "intelligence_v1.level→score table" };
  }

  // ExplanationConfidence mapping.
  const map: Record<string, number> = {
    confirmed: 0.9,
    strongly_supported: 0.8,
    likely: 0.65,
    possible: 0.45,
    insufficient_evidence: 0.2
  };
  return { normalized: map[conf.level] ?? 0.2, mapping: "explanation_confidence table" };
}

