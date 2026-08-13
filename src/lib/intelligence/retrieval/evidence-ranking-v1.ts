export type EvidenceAuthorityV1 = "official" | "first_party" | "third_party" | "unknown";
export type EvidenceDirectnessV1 = "direct" | "indirect" | "unknown";
export type EvidenceFreshnessV1 = { asOf: string | null };

export type EvidenceProvenanceV1 = {
  // Align with #229/#230 principles without importing their contracts:
  // keep UNKNOWN explicit and avoid fabricating completeness.
  authority: EvidenceAuthorityV1;
  sourceKey: string;
  provenanceComplete: boolean;
  independentCorroborationCount: number; // 0+ (0 means none/unknown)
  directness: EvidenceDirectnessV1;
  freshness: EvidenceFreshnessV1;
  contradictionRisk: "low" | "medium" | "high" | "unknown";
};

export type EvidenceCandidateV1 = {
  id: string;
  label: string;
  summary: string;
  provenance: EvidenceProvenanceV1;
};

export type EvidenceRankReasonV1 =
  | "authority_official"
  | "authority_first_party"
  | "authority_third_party"
  | "authority_unknown"
  | "freshness_recent"
  | "freshness_stale"
  | "freshness_unknown"
  | "independent_corroboration"
  | "no_corroboration"
  | "direct_evidence"
  | "indirect_evidence"
  | "directness_unknown"
  | "provenance_complete"
  | "provenance_incomplete"
  | "contradiction_risk_low"
  | "contradiction_risk_high"
  | "contradiction_risk_unknown";

export type RankedEvidenceV1 = {
  candidate: EvidenceCandidateV1;
  reasons: EvidenceRankReasonV1[];
};

function daysSince(asOf: string | null, nowIso: string): number | null {
  if (!asOf) return null;
  const a = Date.parse(asOf);
  const n = Date.parse(nowIso);
  if (!Number.isFinite(a) || !Number.isFinite(n)) return null;
  const ms = n - a;
  if (!Number.isFinite(ms) || ms < 0) return 0;
  return Math.floor(ms / (24 * 60 * 60 * 1000));
}

function authorityScore(a: EvidenceAuthorityV1): number {
  // Coarse buckets; avoid fake precision.
  switch (a) {
    case "official":
      return 0;
    case "first_party":
      return 1;
    case "third_party":
      return 2;
    case "unknown":
    default:
      return 3;
  }
}

function contradictionScore(r: EvidenceProvenanceV1["contradictionRisk"]): number {
  // Lower is better.
  switch (r) {
    case "low":
      return 0;
    case "medium":
      return 1;
    case "high":
      return 2;
    case "unknown":
    default:
      return 3;
  }
}

function directnessScore(d: EvidenceDirectnessV1): number {
  switch (d) {
    case "direct":
      return 0;
    case "indirect":
      return 1;
    case "unknown":
    default:
      return 2;
  }
}

export function rankEvidenceCandidatesV1(input: {
  candidates: EvidenceCandidateV1[];
  nowIso: string;
}): RankedEvidenceV1[] {
  const ranked: RankedEvidenceV1[] = input.candidates.map((c) => {
    const p = c.provenance;
    const reasons: EvidenceRankReasonV1[] = [];

    // Authority
    if (p.authority === "official") reasons.push("authority_official");
    else if (p.authority === "first_party") reasons.push("authority_first_party");
    else if (p.authority === "third_party") reasons.push("authority_third_party");
    else reasons.push("authority_unknown");

    // Freshness
    const ageDays = daysSince(p.freshness.asOf, input.nowIso);
    if (ageDays === null) reasons.push("freshness_unknown");
    else if (ageDays <= 30) reasons.push("freshness_recent");
    else reasons.push("freshness_stale");

    // Independence
    if ((p.independentCorroborationCount ?? 0) >= 2) reasons.push("independent_corroboration");
    else reasons.push("no_corroboration");

    // Directness
    if (p.directness === "direct") reasons.push("direct_evidence");
    else if (p.directness === "indirect") reasons.push("indirect_evidence");
    else reasons.push("directness_unknown");

    // Provenance completeness
    reasons.push(p.provenanceComplete ? "provenance_complete" : "provenance_incomplete");

    // Contradiction risk
    if (p.contradictionRisk === "low") reasons.push("contradiction_risk_low");
    else if (p.contradictionRisk === "high") reasons.push("contradiction_risk_high");
    else reasons.push("contradiction_risk_unknown");

    return { candidate: c, reasons };
  });

  // Deterministic ordering, coarse buckets.
  ranked.sort((ra, rb) => {
    const a = ra.candidate.provenance;
    const b = rb.candidate.provenance;
    const aAuth = authorityScore(a.authority);
    const bAuth = authorityScore(b.authority);
    if (aAuth !== bAuth) return aAuth - bAuth;

    // Prefer complete provenance.
    if (a.provenanceComplete !== b.provenanceComplete) return a.provenanceComplete ? -1 : 1;

    // Prefer lower contradiction risk.
    const aCon = contradictionScore(a.contradictionRisk);
    const bCon = contradictionScore(b.contradictionRisk);
    if (aCon !== bCon) return aCon - bCon;

    // Prefer more independent corroboration.
    const aInd = a.independentCorroborationCount ?? 0;
    const bInd = b.independentCorroborationCount ?? 0;
    if (aInd !== bInd) return bInd - aInd;

    // Prefer direct.
    const aDir = directnessScore(a.directness);
    const bDir = directnessScore(b.directness);
    if (aDir !== bDir) return aDir - bDir;

    // Prefer more recent.
    const aAge = daysSince(a.freshness.asOf, input.nowIso);
    const bAge = daysSince(b.freshness.asOf, input.nowIso);
    if (aAge === null && bAge !== null) return 1;
    if (aAge !== null && bAge === null) return -1;
    if (aAge !== null && bAge !== null && aAge !== bAge) return aAge - bAge;

    // Stable tie-break.
    return ra.candidate.id.localeCompare(rb.candidate.id);
  });

  return ranked;
}

