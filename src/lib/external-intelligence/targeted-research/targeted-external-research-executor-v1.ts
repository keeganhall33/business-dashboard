import crypto from "node:crypto";

import type { EntityRef } from "@/lib/external-intelligence/contracts/entity-ref";
import type { VersionRef } from "@/lib/external-intelligence/contracts/version-ref";

import type { ResearchQuestionV1 } from "@/lib/external-intelligence/opportunities/context-research-questions-v1";

import { buildClassifiedAsClaimV1 } from "@/lib/external-intelligence/contextual-claims/contextual-claims-builders-v1";

import type { ResearchDiscoveryProviderV1 } from "@/lib/external-intelligence/targeted-research/discovery-provider-v1";
import { planOrganizationContextDiscoveryQueriesV1 } from "@/lib/external-intelligence/targeted-research/discovery-templates-v1";
import { fetchPagePreviewV1 } from "@/lib/external-intelligence/targeted-research/page-fetcher-v1";
import { classifySourceCandidateV1 } from "@/lib/external-intelligence/targeted-research/source-classification-v1";
import {
  canonicalizeUrlV1,
  computeTargetedWebEvidenceReferenceIdV1,
  computeTargetedWebSourceIdV1
} from "@/lib/external-intelligence/targeted-research/url-canonicalization-v1";
import type {
  ResearchSourceCandidateV1,
  TargetedExternalResearchExecutorResultV1,
  TargetedExternalResearchPreviewV1
} from "@/lib/external-intelligence/targeted-research/targeted-research-contracts-v1";

function sha256Hex(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

export type TargetedExternalResearchDepsV1 = {
  discovery: ResearchDiscoveryProviderV1;
  evidenceReuseLookup: (input: { source_id: string; canonical_url: string }) => Promise<{ exists: boolean }>;
};

export type TargetedExternalResearchInputV1 = {
  research_question: ResearchQuestionV1;
  candidate_id: string;
  subject: EntityRef;
  now_iso: string;

  deps: TargetedExternalResearchDepsV1;

  bounds: {
    max_queries: number; // <=3
    max_results_per_query: number; // <=5
    max_unique_urls: number; // <=10
    max_selected_sources: number; // <=3, expected 1
    fetch_timeout_ms: number;
    fetch_max_bytes: number;
  };
};

export function supportsQuestionV1(q: ResearchQuestionV1): boolean {
  return q.question_type === "ORGANIZATION_CONTEXT" && q.source_domain === "EXTERNAL";
}

function assertQuestionScopeV1(input: TargetedExternalResearchInputV1) {
  const q = input.research_question;
  if (q.question_type !== "ORGANIZATION_CONTEXT") throw new Error("unsupported_question_type");
  if (q.source_domain !== "EXTERNAL") throw new Error("question_not_external");
  if (input.subject.entity_type !== "organization") throw new Error("subject_must_be_organization");
}

function selectMinimalSourcesV1(candidates: ResearchSourceCandidateV1[]): ResearchSourceCandidateV1[] {
  // Prefer a single official website/newsroom candidate.
  const preferred = candidates
    .filter((c) => c.source_class.startsWith("OFFICIAL_"))
    .sort((a, b) => {
      // higher confidence first, then lower rank.
      const confScore = (x: string) => (x === "high" ? 3 : x === "medium" ? 2 : x === "low" ? 1 : 0);
      const dc = confScore(b.official_domain_confidence) - confScore(a.official_domain_confidence);
      if (dc !== 0) return dc;
      return a.search_rank - b.search_rank;
    });

  if (preferred[0]) return [preferred[0]];

  // Fallback: take best-ranked unknown.
  const any = candidates.slice().sort((a, b) => a.search_rank - b.search_rank);
  return any[0] ? [any[0]] : [];
}

function computeProspectiveEvidenceVersionRef(input: {
  evidence_reference_id: string;
  content_hash: string;
  legal_policy_version: string;
}): VersionRef {
  return Object.freeze({
    object_type: "evidence_reference",
    object_id: input.evidence_reference_id,
    version_id: null,
    content_hash: input.content_hash,
    schema_version: "evidence_reference_v1",
    policy_version: input.legal_policy_version,
    created_at: new Date().toISOString()
  });
}

type ExtractedClassificationV1 =
  | {
      classification_kind: "business_domain";
      classification_value: "sports";
      source_label: string;
      confidence: "high" | "medium";
    }
  | {
      classification_kind: "organization_type";
      classification_value: "league_or_tour" | "sports_organization";
      source_label: string;
      confidence: "high" | "medium";
    };

function tryExtractClassificationFromPreview(input: {
  preview: { jsonld_types: string[]; title: string | null; og_title: string | null; meta_description: string | null };
}): ExtractedClassificationV1[] {
  // Extremely conservative V1 mapping: only assert what is clearly signaled.
  const types = input.preview.jsonld_types.map((t) => t.toLowerCase());

  const label = (input.preview.og_title ?? input.preview.title ?? "").trim();
  const desc = (input.preview.meta_description ?? "").trim();

  const out: ExtractedClassificationV1[] = [];

  // If JSON-LD explicitly declares SportsOrganization, we can safely classify business_domain=sports.
  if (types.includes("sportsorganization")) {
    out.push({
      classification_kind: "organization_type",
      classification_value: "sports_organization",
      source_label: label || "SportsOrganization",
      confidence: "medium"
    });
    out.push({
      classification_kind: "business_domain",
      classification_value: "sports",
      source_label: label || "sports",
      confidence: "high"
    });
    return out;
  }

  // If title or meta description clearly contains "tour", map to league_or_tour (medium).
  if (label.toLowerCase().includes("tour") || desc.toLowerCase().includes("tour")) {
    out.push({
      classification_kind: "organization_type",
      classification_value: "league_or_tour",
      source_label: label,
      confidence: "medium"
    });
  }

  return out;
}

export async function executeTargetedExternalResearchPreviewV1(
  input: TargetedExternalResearchInputV1
): Promise<TargetedExternalResearchExecutorResultV1> {
  try {
    assertQuestionScopeV1(input);
  } catch (e) {
    return { status: "unsupported", reason: e instanceof Error ? e.message : String(e) };
  }

  const orgName = input.subject.canonical_name;
  const queries = planOrganizationContextDiscoveryQueriesV1({ organization_name: orgName }).slice(0, input.bounds.max_queries);

  // Discovery.
  const discovered: Array<{ query_id: string; results: Array<{ url: string; title: string | null; snippet: string | null; rank: number }> }> = [];

  for (const q of queries) {
    const res = await input.deps.discovery.search({ query: q.query, max_results: input.bounds.max_results_per_query });
    discovered.push({ query_id: q.query_id, results: res.slice(0, input.bounds.max_results_per_query) });
  }

  // Candidate URLs.
  const candidates: ResearchSourceCandidateV1[] = [];
  const seen = new Set<string>();

  for (const d of discovered) {
    for (const r of d.results) {
      if (candidates.length >= input.bounds.max_unique_urls) break;
      let canon: { canonical_url: string; domain: string };
      try {
        canon = canonicalizeUrlV1(r.url);
      } catch {
        continue;
      }
      if (seen.has(canon.canonical_url)) continue;
      seen.add(canon.canonical_url);

      const cls = classifySourceCandidateV1({
        canonical_url: canon.canonical_url,
        domain: canon.domain,
        org_name: orgName,
        title: r.title
      });

      candidates.push({
        url: r.url,
        canonical_url: canon.canonical_url,
        domain: canon.domain,
        title: r.title,
        snippet: r.snippet,
        discovered_via_query_id: d.query_id,
        search_rank: r.rank,
        source_class: cls.source_class,
        official_domain_confidence: cls.official_domain_confidence,
        selection_status: "considered",
        rejection_reason: null
      });
    }
  }

  const selected = selectMinimalSourcesV1(candidates).slice(0, input.bounds.max_selected_sources);

  // Mark selections.
  const selectedSet = new Set(selected.map((s) => s.canonical_url));
  const finalCandidates = candidates.map((c) =>
    selectedSet.has(c.canonical_url) ? { ...c, selection_status: "selected" as const } : c
  );

  if (!selected[0]) {
    return { status: "blocked", reason: "no_sources_selected" };
  }

  // Source identity and prospective evidence id.
  const source_id = computeTargetedWebSourceIdV1(selected[0].domain);
  const evidence_reference_id = computeTargetedWebEvidenceReferenceIdV1({ source_id, canonical_url: selected[0].canonical_url });

  const reuse = await input.deps.evidenceReuseLookup({ source_id, canonical_url: selected[0].canonical_url });

  // Fetch preview (bounded, no recursion).
  const fetched: Array<{
    canonical_url: string;
    http_status: number;
    final_url: string;
    content_type: string | null;
    retention_mode: "link_only" | "structured_metadata";
    title: string | null;
    meta_description: string | null;
    og_site_name: string | null;
    og_title: string | null;
    jsonld_types: string[];
  }> = [];
  for (const s of selected) {
    const f = await fetchPagePreviewV1({
      canonical_url: s.canonical_url,
      timeout_ms: input.bounds.fetch_timeout_ms,
      max_bytes: input.bounds.fetch_max_bytes
    });

    if (!f.ok) {
      fetched.push({
        canonical_url: s.canonical_url,
        http_status: f.http_status,
        final_url: f.final_url,
        content_type: null,
        retention_mode: "link_only",
        title: null,
        meta_description: null,
        og_site_name: null,
        og_title: null,
        jsonld_types: []
      });
      continue;
    }

    fetched.push(f.preview);
  }

  // Build contextual claim previews (in memory only).
  const proposed: TargetedExternalResearchPreviewV1["proposed_contextual_claims"] = [];

  // Create a deterministic pseudo content hash for the prospective evidence version based on retained metadata only.
  const retainedSemantic = {
    canonical_url: selected[0].canonical_url,
    title: fetched[0]?.title ?? null,
    og_title: fetched[0]?.og_title ?? null,
    jsonld_types: fetched[0]?.jsonld_types ?? []
  };
  const evidence_content_hash = sha256Hex(JSON.stringify({ v: "targeted_web_preview_v1", retainedSemantic }));

  const evidence_version_ref: VersionRef = computeProspectiveEvidenceVersionRef({
    evidence_reference_id,
    content_hash: evidence_content_hash,
    legal_policy_version: "targeted_web.preview_only.v1"
  });

  const extracted =
    fetched[0]?.http_status === 200
      ? tryExtractClassificationFromPreview({ preview: { jsonld_types: fetched[0].jsonld_types, title: fetched[0].title, og_title: fetched[0].og_title, meta_description: fetched[0].meta_description } })
      : [];

  for (const ex of extracted) {
    // Only emit claim preview if classification value is in our bounded enums.
    // For this controlled proof, only business_domain=sports and organization_type=league_or_tour are allowed outputs.
    const normalization_policy_version = "contextual_claims_v1.normalization.preview_only";

    try {
      const claim = buildClassifiedAsClaimV1({
        evidence_version_ref,
        retrieved_at_iso: input.now_iso,
        subject: input.subject,
        classification_kind: ex.classification_kind,
        classification_value: ex.classification_value,
        source_label: ex.source_label || null,
        normalization_policy_version,
        normalization_confidence: ex.confidence
      });

      const content_hash = sha256Hex(JSON.stringify(claim));

      proposed.push({
        predicate: "classified_as",
        subject_entity_id: input.subject.entity_id,
        subject_canonical_name: input.subject.canonical_name,
        classification_kind: ex.classification_kind,
        classification_value: ex.classification_value,
        source_label: ex.source_label || null,
        normalization_policy_version,
        normalization_confidence: ex.confidence,
        claim_id: claim.claim_id,
        claim_fingerprint: claim.claim_fingerprint,
        content_hash,
        clearly_supported: ex.confidence === "high",
        support_rationale: "preview_only_extraction" // explicit: not persisted, not verified
      });
    } catch {
      // suppress unsupported
    }
  }

  const preview: TargetedExternalResearchPreviewV1 = {
    research_question_id: input.research_question.research_question_id,
    candidate_id: input.candidate_id,
    question_type: "ORGANIZATION_CONTEXT",
    subject_entity_id: input.subject.entity_id,
    subject_canonical_name: input.subject.canonical_name,

    discovery_queries: queries,
    urls_considered: finalCandidates.length,
    selected_sources: selected.map((s) => ({
      canonical_url: s.canonical_url,
      source_class: s.source_class,
      official_domain_confidence: s.official_domain_confidence
    })),

    fetched,

    evidence_reuse: reuse.exists ? "YES" : "NO",
    prospective_source_id: source_id,
    prospective_evidence_reference_id: evidence_reference_id,

    proposed_contextual_claims: proposed
  };

  return { status: "preview", preview };
}
