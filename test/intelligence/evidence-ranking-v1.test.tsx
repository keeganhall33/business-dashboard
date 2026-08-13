import test from "node:test";
import assert from "node:assert/strict";
import { rankEvidenceCandidatesV1, type EvidenceCandidateV1 } from "../../src/lib/intelligence/retrieval/evidence-ranking-v1";

const NOW = "2026-08-13T00:00:00.000Z";

function c(overrides: Partial<EvidenceCandidateV1>): EvidenceCandidateV1 {
  return {
    id: overrides.id ?? "x",
    label: overrides.label ?? "x",
    summary: overrides.summary ?? "x",
    provenance: {
      authority: "unknown",
      sourceKey: "unknown",
      provenanceComplete: false,
      independentCorroborationCount: 0,
      directness: "unknown",
      freshness: { asOf: null },
      contradictionRisk: "unknown",
      ...(overrides.provenance ?? {})
    }
  };
}

test("ranks official + complete + low contradiction above third-party incomplete", () => {
  const official = c({
    id: "a",
    provenance: {
      authority: "official",
      sourceKey: "nba",
      provenanceComplete: true,
      contradictionRisk: "low",
      independentCorroborationCount: 0,
      directness: "direct",
      freshness: { asOf: "2026-08-10T00:00:00.000Z" }
    }
  });
  const blog = c({
    id: "b",
    provenance: {
      authority: "third_party",
      sourceKey: "random_blog",
      provenanceComplete: false,
      contradictionRisk: "high",
      independentCorroborationCount: 0,
      directness: "indirect",
      freshness: { asOf: "2025-01-01T00:00:00.000Z" }
    }
  });
  const ranked = rankEvidenceCandidatesV1({ candidates: [blog, official], nowIso: NOW });
  assert.equal(ranked[0].candidate.id, "a");
  assert.ok(ranked[0].reasons.includes("authority_official"));
  assert.ok(ranked[0].reasons.includes("provenance_complete"));
});

test("downranks incomplete provenance even when authority matches", () => {
  const complete = c({ id: "a", provenance: { authority: "first_party", provenanceComplete: true, contradictionRisk: "low" } });
  const incomplete = c({ id: "b", provenance: { authority: "first_party", provenanceComplete: false, contradictionRisk: "low" } });
  const ranked = rankEvidenceCandidatesV1({ candidates: [incomplete, complete], nowIso: NOW });
  assert.equal(ranked[0].candidate.id, "a");
  assert.ok(ranked[0].reasons.includes("provenance_complete"));
  assert.ok(ranked[1].reasons.includes("provenance_incomplete"));
});

test("prefers independent corroboration within same authority bucket", () => {
  const one = c({ id: "a", provenance: { authority: "third_party", provenanceComplete: true, independentCorroborationCount: 0, contradictionRisk: "low" } });
  const many = c({ id: "b", provenance: { authority: "third_party", provenanceComplete: true, independentCorroborationCount: 3, contradictionRisk: "low" } });
  const ranked = rankEvidenceCandidatesV1({ candidates: [one, many], nowIso: NOW });
  assert.equal(ranked[0].candidate.id, "b");
  assert.ok(ranked[0].reasons.includes("independent_corroboration"));
});

test("keeps UNKNOWN freshness explicit and prefers recent over stale", () => {
  const recent = c({ id: "a", provenance: { authority: "unknown", provenanceComplete: true, freshness: { asOf: "2026-08-12T00:00:00.000Z" }, contradictionRisk: "low" } });
  const stale = c({ id: "b", provenance: { authority: "unknown", provenanceComplete: true, freshness: { asOf: "2026-05-01T00:00:00.000Z" }, contradictionRisk: "low" } });
  const unknown = c({ id: "c", provenance: { authority: "unknown", provenanceComplete: true, freshness: { asOf: null }, contradictionRisk: "low" } });
  const ranked = rankEvidenceCandidatesV1({ candidates: [unknown, stale, recent], nowIso: NOW });
  assert.equal(ranked[0].candidate.id, "a");
  assert.equal(ranked[2].candidate.id, "c");
  assert.ok(ranked[2].reasons.includes("freshness_unknown"));
});

