import type {
  CollectorRelationshipRow,
  EvidenceRef,
  ExternalClaimSignal,
  OpportunityCandidateV2,
  OpportunityPipelineRow,
  OpportunitySeed
} from "./types";
import { inferArchetypes, pickBestArchetype } from "./archetypes";
import { opportunityDedupeKey, guessOrganizationFromSeed } from "./normalize";
import { scoreOpportunityFactors } from "./scoring";
import { buildPreliminaryValuation } from "./valuation";
import { recommendAction } from "./recommendation";
import { buildHoldTriggers, buildNextResearchQuestions } from "./research";

export type ExternalCandidate = {
  id: string;
  headline: string;
  source?: string | null;
  summary?: string | null;
  whyNow?: string | null;
  collabIdea?: string | null;
  sourceUrl?: string | null;
  organizationHint?: string | null;
  day?: string | null;
};

export type GraphClaimCandidate = {
  id: string;
  signal: ExternalClaimSignal;
  organizationHint?: string | null;
};

function seedEvidenceUrl(url: string | null | undefined): EvidenceRef[] {
  if (!url) return [];
  return [{ kind: "url", ref: url, label: "Source" }];
}

export function buildSeedsFromPipeline(rows: OpportunityPipelineRow[]): OpportunitySeed[] {
  return rows.map((row) => {
    const evidence: EvidenceRef[] = [];
    if (row.source) evidence.push({ kind: "note", ref: `source:${row.source}` });
    if (row.notes_md && /(https?:\/\/)/i.test(row.notes_md)) {
      evidence.push({ kind: "note", ref: "notes_md:contains_url" });
    }
    evidence.push({ kind: "db_row", ref: `opportunity_pipeline:${row.id}` });

    return {
      layer: "first_party_active",
      seedId: `pipeline:${row.id}`,
      name: row.name,
      organization: row.organization,
      sourceSummary: row.source ?? null,
      evidence,
      claims: [
        {
          id: `claim:pipeline:${row.id}`,
          text: `Pipeline opportunity: ${row.name}${row.organization ? ` (${row.organization})` : ""}`,
          evidence: evidence.slice(0, 2)
        }
      ],
      artifacts: [
        { kind: "organization", label: row.organization ?? "Unknown org", refs: [{ kind: "db_row", ref: `opportunity_pipeline:${row.id}` }] }
      ],
      linkedPipelineOpportunityId: row.id
    };
  });
}

export function buildSeedsFromExternalCandidates(candidates: ExternalCandidate[]): OpportunitySeed[] {
  return candidates
    .filter((c) => c.headline && c.headline.trim().length > 0)
    .map((c) => {
      const evidence = [...seedEvidenceUrl(c.sourceUrl)];
      evidence.push({ kind: "db_row", ref: `external_candidate:${c.id}` });

      const org = c.organizationHint?.trim() || null;
      const summary = [c.summary, c.whyNow, c.collabIdea].filter(Boolean).join(" — ") || null;

      return {
        layer: "external_candidates",
        seedId: `external:${c.id}`,
        name: c.headline,
        organization: org,
        sourceSummary: c.source ?? null,
        evidence,
        claims: [
          {
            id: `claim:external:${c.id}`,
            text: c.headline,
            evidence: evidence.slice(0, 1)
          }
        ],
        artifacts: [
          ...(org ? [{ kind: "organization" as const, label: org, refs: evidence }] : []),
          ...(c.day ? [{ kind: "event" as const, label: `Industry pulse day ${c.day}`, refs: evidence }] : [])
        ],
        linkedPipelineOpportunityId: null
      };
    });
}

export function buildSeedsFromClaimSignals(claims: GraphClaimCandidate[]): OpportunitySeed[] {
  return claims.map((c) => {
    const evidence: EvidenceRef[] = [
      { kind: "db_row", ref: `external_claim_versions_v1:${c.signal.claimId}@${c.signal.contentHash}`, label: "Claim version" }
    ];
    for (const url of c.signal.evidenceUrls ?? []) {
      evidence.push({ kind: "url", ref: url, label: "Evidence" });
    }

    const org = c.organizationHint?.trim() || c.signal.subjectLabel;
    const name = `${c.signal.subjectLabel}: ${c.signal.predicate} → ${c.signal.objectLabel}`;
    const summary = `Claim signal (${c.signal.predicate})`;

    return {
      layer: "external_claim_signal",
      seedId: `claim:${c.signal.claimId}@${c.signal.contentHash}`,
      name,
      organization: org,
      sourceSummary: summary,
      evidence,
      claims: [
        {
          id: `claim:${c.signal.claimId}`,
          text: name,
          evidence
        }
      ],
      artifacts: [
        { kind: "organization", label: org, refs: evidence },
        { kind: "program_surface", label: c.signal.predicate, refs: evidence }
      ],
      linkedPipelineOpportunityId: null
    };
  });
}

function matchRelationship(relationships: CollectorRelationshipRow[], candidateName: string, org: string | null): CollectorRelationshipRow | null {
  const hay = `${candidateName} ${org ?? ""}`.toLowerCase();
  // Simple deterministic match: substring against collector_name.
  for (const rel of relationships) {
    const key = (rel.collector_name ?? "").toLowerCase();
    if (key && (hay.includes(key) || key.includes(hay.trim()))) return rel;
  }
  return null;
}

export function dedupeSeeds(seeds: OpportunitySeed[]) {
  const seen = new Set<string>();
  const unique: OpportunitySeed[] = [];
  for (const seed of seeds) {
    const org = seed.organization ?? guessOrganizationFromSeed(seed);
    const key = opportunityDedupeKey(seed.name, org);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push({ ...seed, organization: org });
  }
  return unique;
}

export function buildOpportunityCandidatesV2(params: {
  pipelineRows: OpportunityPipelineRow[];
  externalCandidates: ExternalCandidate[];
  claimSignals?: GraphClaimCandidate[];
  relationships: CollectorRelationshipRow[];
  // Explicit exclusions (do not reactivate without a stored trigger).
  holdExclusions?: { dedupeKeys: string[] };
}): OpportunityCandidateV2[] {
  const pipelineSeeds = buildSeedsFromPipeline(params.pipelineRows);
  const externalSeeds = buildSeedsFromExternalCandidates(params.externalCandidates);
  const claimSeeds = buildSeedsFromClaimSignals(params.claimSignals ?? []);

  // Input order is meaningful (A..E). Pipeline first so it wins dedupe.
  const seeds = dedupeSeeds([...pipelineSeeds, ...externalSeeds, ...claimSeeds]);

  const excluded = new Set(params.holdExclusions?.dedupeKeys ?? []);

  const candidates: OpportunityCandidateV2[] = [];
  for (const seed of seeds) {
    const org = seed.organization ?? null;
    const dedupeKey = opportunityDedupeKey(seed.name, org);
    if (excluded.has(dedupeKey)) continue;

    const pipeline = seed.linkedPipelineOpportunityId
      ? (params.pipelineRows.find((row) => row.id === seed.linkedPipelineOpportunityId) ?? null)
      : null;
    const relationship = matchRelationship(params.relationships, seed.name, org);

    const archetypes = inferArchetypes(seed, pipeline);
    const bestArchetype = pickBestArchetype(archetypes, pipeline);

    const scored = scoreOpportunityFactors({
      seedName: seed.name,
      organization: org,
      pipeline,
      relationship,
      archetype: bestArchetype
    });

    const evidenceStrength = scored.factors.find((f) => f.id === "EVIDENCE_STRENGTH")?.value ?? 0;
    const commercialScale = scored.factors.find((f) => f.id === "COMMERCIAL_SCALE");
    const prestige = scored.factors.find((f) => f.id === "PRESTIGE");

    const valuation = buildPreliminaryValuation({
      archetype: bestArchetype,
      pipeline,
      evidenceStrengthScore: evidenceStrength,
      commercialScaleScore: commercialScale?.known ? (commercialScale.value ?? null) : null,
      prestigeScore: prestige?.known ? (prestige.value ?? null) : null
    });

    const action = recommendAction({ overallScore: scored.overallScore, factors: scored.factors, pipeline });
    const holdTriggers = action.recommendation === "HOLD_AND_MONITOR" ? buildHoldTriggers(seed.sourceSummary ?? seed.name) : [];
    const nextResearchQuestions = buildNextResearchQuestions({ factors: scored.factors, recommendation: action.recommendation });

    candidates.push({
      dedupeKey,
      seed,
      pipeline,
      archetypes,
      bestArchetype,
      factors: scored.factors,
      overallScore: scored.overallScore,
      scoreNotes: [...scored.scoreNotes, ...action.notes],
      biggestUncertainty: scored.biggestUncertainty,
      valuation,
      recommendation: action.recommendation,
      holdTriggers,
      nextResearchQuestions
    });
  }

  // Deterministic ranking: score desc, then prestige signal, then name.
  candidates.sort((a, b) => {
    if (b.overallScore !== a.overallScore) return b.overallScore - a.overallScore;
    const bp = b.factors.find((f) => f.id === "PRESTIGE")?.value ?? 0;
    const ap = a.factors.find((f) => f.id === "PRESTIGE")?.value ?? 0;
    if (bp !== ap) return bp - ap;
    return a.seed.name.localeCompare(b.seed.name);
  });

  return candidates;
}
