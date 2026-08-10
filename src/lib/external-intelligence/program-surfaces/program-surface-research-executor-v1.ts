import type { ClaimQualifierV2 } from "@/lib/external-intelligence/contracts/claim-qualifiers-v2";
import type { Claim } from "@/lib/external-intelligence/contracts/claim";
import { buildProgramSurfaceClaimV1 } from "@/lib/external-intelligence/program-surfaces/program-surface-builders-v1";
import type { ProgramSurfacePredicateV1 } from "@/lib/external-intelligence/program-surfaces/program-surface-policy-v1";
import type { ProgramSurfaceObjectValueV1 } from "@/lib/external-intelligence/program-surfaces/program-surface-policy-v1";
import { mapQuestionTypeToPredicateV1 } from "@/lib/external-intelligence/program-surfaces/program-surface-research-policy-v1";
import type {
  ProgramSurfaceNormalizedCandidateV1,
  ProgramSurfaceResearchExecutorResultV1,
  ProgramSurfaceResearchQuestionV1,
  ProgramSurfaceResearchPreviewV1,
  ProgramSurfaceResearchDepsV1
} from "@/lib/external-intelligence/program-surfaces/program-surface-research-contracts-v1";
import { normalizeProgramSurfaceFromTextV1 } from "@/lib/external-intelligence/program-surfaces/program-surface-research-normalizer-v1";
import { computeContentHash } from "@/lib/external-intelligence/contracts/version-ref";
import type { ExternalSourceClassV1 } from "@/lib/external-intelligence/targeted-research/targeted-research-contracts-v1";

function dedupeNormalizedCandidatesV1(cands: ProgramSurfaceNormalizedCandidateV1[]): ProgramSurfaceNormalizedCandidateV1[] {
  // Canonical dedupe key: predicate|object|qualifiers(JSON canonical-ish via stable key order).
  const seen = new Set<string>();
  const out: ProgramSurfaceNormalizedCandidateV1[] = [];
  for (const c of cands) {
    const quals = [...c.qualifiers]
      .slice()
      .sort((a, b) => `${a.key}\u0000${a.value_type}\u0000${String(a.value)}`.localeCompare(`${b.key}\u0000${b.value_type}\u0000${String(b.value)}`));
    const key = `${c.predicate}|${c.object_value}|${JSON.stringify(quals)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
  return out;
}

function normalizeToCandidatePreviewV1(input: {
  predicate: ProgramSurfacePredicateV1;
  normalized: ReturnType<typeof normalizeProgramSurfaceFromTextV1>;
}): ProgramSurfaceNormalizedCandidateV1[] {
  if (!input.normalized.ok) return [];
  return input.normalized.candidates
    .filter((c) => c.confidence !== "low" && c.support_verdict !== "not_supported")
    .map((c) => {
      return {
        predicate: c.predicate,
        object_value: c.object_value,
        qualifiers: c.qualifiers as ClaimQualifierV2[],
        normalization_confidence: c.confidence,
        support_verdict: c.support_verdict,
        support_rationale: c.support_rationale,
        support_excerpts: c.support_excerpts
      };
    });
}

function planDiscoveryQueriesV1(input: { question_type: string; organization_name: string }): Array<{ query_id: string; query: string }> {
  // V1: minimal, deterministic. Official-first by including org name and obvious keywords.
  const org = input.organization_name;
  if (input.question_type === "RQ_EVENT_FOOTPRINT") {
    return [
      { query_id: "q1", query: `${org} tour schedule` },
      { query_id: "q2", query: `${org} calendar tournaments` }
    ];
  }
  if (input.question_type === "RQ_VIP_HOSPITALITY") {
    return [
      { query_id: "q1", query: `${org} VIP hospitality packages` },
      { query_id: "q2", query: `${org} membership hospitality` }
    ];
  }
  if (input.question_type === "RQ_PARTNERSHIP_ACTIVATION") {
    return [
      { query_id: "q1", query: `${org} partner activation campaign integration` },
      { query_id: "q2", query: `${org} sponsor activation program` }
    ];
  }
  // Default: single conservative query.
  return [{ query_id: "q1", query: `${org} ${input.question_type.replace(/^RQ_/, "").toLowerCase()}` }];
}

function validateCanonicalDomainHintV1(raw: string): { ok: true; domain: string } | { ok: false; reason: string } {
  const s = String(raw ?? "").trim();
  if (!s) return { ok: false, reason: "canonical_domain_empty" };

  // Must be host/domain only.
  // Reject obvious scheme-bearing, path, query, fragment, userinfo, or port forms.
  if (s.includes("://")) return { ok: false, reason: "canonical_domain_must_not_include_scheme" };
  if (/[\/?#]/.test(s)) return { ok: false, reason: "canonical_domain_must_not_include_path_query_or_fragment" };
  if (s.includes("@")) return { ok: false, reason: "canonical_domain_must_not_include_userinfo" };
  if (s.includes(":")) return { ok: false, reason: "canonical_domain_must_not_include_port_or_ipv6" };

  // Normalize via URL parsing (without allowing path/etc).
  let u: URL;
  try {
    u = new URL(`https://${s}`);
  } catch {
    return { ok: false, reason: "canonical_domain_invalid" };
  }

  const host = u.hostname.toLowerCase();
  if (!host) return { ok: false, reason: "canonical_domain_invalid" };

  // Fail closed on localhost / local-network-ish hostnames.
  if (host === "localhost" || host.endsWith(".local")) return { ok: false, reason: "canonical_domain_localhost_not_allowed" };
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)) return { ok: false, reason: "canonical_domain_ip_literal_not_allowed" };

  return { ok: true, domain: host };
}

function buildOfficialHomepageSeedV1(domain: string): string {
  return `https://${domain}/`;
}

function extractSameDomainLinksV1(input: { base_canonical_url: string; raw_html: string; max: number }): string[] {
  const { canonical_url: base } = { canonical_url: input.base_canonical_url };
  let baseUrl: URL;
  try {
    baseUrl = new URL(base);
  } catch {
    return [];
  }

  const out: string[] = [];
  const seen = new Set<string>();

  // Minimal href extraction. (Deterministic, non-HTML-parser.)
  const re = /href\s*=\s*"([^"]+)"/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(input.raw_html)) !== null) {
    const href = m[1] ?? "";
    if (!href) continue;
    let u: URL;
    try {
      u = new URL(href, baseUrl);
    } catch {
      continue;
    }
    if (u.hostname !== baseUrl.hostname) continue;
    u.hash = "";
    const canon = u.toString();
    if (seen.has(canon)) continue;
    seen.add(canon);
    out.push(canon);
    if (out.length >= input.max) break;
  }
  return out;
}

function rankEventFootprintLinksV1(urls: string[]): string[] {
  const keywords = ["schedule", "calendar", "tour", "tournament", "tournaments", "events", "event", "competition", "competitions"];
  const score = (u: string) => {
    const p = (() => {
      try {
        return new URL(u).pathname.toLowerCase();
      } catch {
        return u.toLowerCase();
      }
    })();
    let s = 0;
    for (const k of keywords) {
      if (p.includes(k)) s += 1;
    }
    return s;
  };

  return [...urls]
    .map((u) => ({ u, s: score(u) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || a.u.localeCompare(b.u))
    .map((x) => x.u);
}

function selectMinimalSourcesV1(
  candidates: Array<{ canonical_url: string; source_class: ExternalSourceClassV1; official_domain_confidence: string; search_rank: number }>
) {
  const preferred = candidates
    .filter((c) => String(c.source_class).startsWith("OFFICIAL_"))
    .sort((a, b) => {
      const confScore = (x: string) => (x === "high" ? 3 : x === "medium" ? 2 : x === "low" ? 1 : 0);
      const dc = confScore(String(b.official_domain_confidence)) - confScore(String(a.official_domain_confidence));
      if (dc !== 0) return dc;
      return a.search_rank - b.search_rank;
    });

  if (preferred[0]) return [preferred[0]];
  const any = candidates.slice().sort((a, b) => a.search_rank - b.search_rank);
  return any[0] ? [any[0]] : [];
}

export async function executeProgramSurfaceResearchPreviewV1(input: {
  question: ProgramSurfaceResearchQuestionV1;
  now_iso: string;
  deps: ProgramSurfaceResearchDepsV1;
}): Promise<ProgramSurfaceResearchExecutorResultV1> {
  const q = input.question;

  if (q.source_domain !== "EXTERNAL") return { status: "unsupported", reason: "question_not_external" };
  if (q.subject.entity_type !== "organization") return { status: "unsupported", reason: "subject_must_be_organization" };
  if (q.bounds.max_selected_sources > 1) return { status: "blocked", reason: "bounds_violation:max_selected_sources" };

  const predicate = mapQuestionTypeToPredicateV1(q.question_type);

  // Optional, safe diagnostic suffix for non-blocking discovery/fallback failures.
  // This must never include response bodies.
  let discoveryDiagnostic: string | null = null;

  const domainHintRaw = q.discovery_hints?.canonical_domain;
  const domainHint =
    typeof domainHintRaw === "string" && domainHintRaw.trim().length > 0
      ? validateCanonicalDomainHintV1(domainHintRaw)
      : null;

  if (domainHint && !domainHint.ok) {
    const preview: ProgramSurfaceResearchPreviewV1 = {
      research_question_id: q.research_question_id,
      candidate_id: q.candidate_id,
      question_type: q.question_type,
      subject_entity_id: q.subject.entity_id,
      subject_canonical_name: q.subject.canonical_name,
      discovery_queries: planDiscoveryQueriesV1({ question_type: q.question_type, organization_name: q.subject.canonical_name }).slice(
        0,
        q.bounds.max_queries
      ),
      urls_considered: 0,
      selected_sources: [],
      fetched: [],
      prospective_source_id: "",
      prospective_evidence_reference_id: "",
      evidence_reuse: "NO",
      source_eligibility: "FAIL",
      retention_policy: "blocked",
      raw_html_transient: "NO",
      raw_html_retained: "NO",
      retained_support: "neither",
      normalized_candidates: [],
      claim_previews: [],
      answer_status: "DISCOVERY_UNAVAILABLE",
      answer_reason: `invalid_canonical_domain_hint:${domainHint.reason}`
    };
    return { status: "preview", preview };
  }

  // Discovery planning (queries are kept for audit even when we seed official first).
  const discovery_queries = planDiscoveryQueriesV1({ question_type: q.question_type, organization_name: q.subject.canonical_name }).slice(
    0,
    q.bounds.max_queries
  );

  const candidates: Array<{
    canonical_url: string;
    source_class: ExternalSourceClassV1;
    official_domain_confidence: string;
    search_rank: number;
    title: string | null;
    snippet: string | null;
    discovery_origin: "official_domain_seed" | "search_query";
    discovered_via_query_id: string | null;
  }> = [];
  const seen = new Set<string>();

  // OFFICIAL DOMAIN SEED FIRST (if provided).
  if (domainHint && domainHint.ok) {
    const seeded_url = buildOfficialHomepageSeedV1(domainHint.domain);
    let canon: { canonical_url: string; domain: string };
    try {
      canon = input.deps.canonicalizeUrl(seeded_url);
    } catch {
      // Should never happen; treat as discovery unavailable rather than guessing.
      const preview: ProgramSurfaceResearchPreviewV1 = {
        research_question_id: q.research_question_id,
        candidate_id: q.candidate_id,
        question_type: q.question_type,
        subject_entity_id: q.subject.entity_id,
        subject_canonical_name: q.subject.canonical_name,
        discovery_queries,
        urls_considered: 0,
        selected_sources: [],
        fetched: [],
        prospective_source_id: "",
        prospective_evidence_reference_id: "",
        evidence_reuse: "NO",
        source_eligibility: "FAIL",
        retention_policy: "blocked",
        raw_html_transient: "NO",
        raw_html_retained: "NO",
        retained_support: "neither",
        normalized_candidates: [],
        claim_previews: [],
        answer_status: "DISCOVERY_UNAVAILABLE",
        answer_reason: "canonical_domain_seed_canonicalization_failed"
      };
      return { status: "preview", preview };
    }

    if (!seen.has(canon.canonical_url)) {
      seen.add(canon.canonical_url);
      const c = input.deps.classifySource({ canonical_url: canon.canonical_url, title: null, snippet: null });
      candidates.push({
        canonical_url: c.canonical_url,
        source_class: c.source_class,
        official_domain_confidence: c.official_domain_confidence,
        search_rank: 0,
        title: null,
        snippet: null,
        discovery_origin: "official_domain_seed",
        discovered_via_query_id: null
      });
    }
  }

  const selected = selectMinimalSourcesV1(candidates).slice(0, q.bounds.max_selected_sources);

  // If we have no seed selection, use configured search adapter.
  if (selected.length === 0) {
    const discovered: Array<{ query_id: string; results: Array<{ url: string; title: string | null; snippet: string | null; rank: number }> }> = [];
    try {
      for (const dq of discovery_queries) {
        const res = await input.deps.discovery.search({ query: dq.query, max_results: q.bounds.max_results_per_query });
        discovered.push({ query_id: dq.query_id, results: res.slice(0, q.bounds.max_results_per_query) });
      }
    } catch (e) {
      const preview: ProgramSurfaceResearchPreviewV1 = {
        research_question_id: q.research_question_id,
        candidate_id: q.candidate_id,
        question_type: q.question_type,
        subject_entity_id: q.subject.entity_id,
        subject_canonical_name: q.subject.canonical_name,
        discovery_queries,
        urls_considered: 0,
        selected_sources: [],
        fetched: [],
        prospective_source_id: "",
        prospective_evidence_reference_id: "",
        evidence_reuse: "NO",
        source_eligibility: "FAIL",
        retention_policy: "blocked",
        raw_html_transient: "NO",
        raw_html_retained: "NO",
        retained_support: "neither",
        normalized_candidates: [],
        claim_previews: [],
        answer_status: "DISCOVERY_UNAVAILABLE",
        answer_reason: e instanceof Error ? e.message : String(e)
      };
      return { status: "preview", preview };
    }

    for (const d of discovered) {
      for (const r of d.results) {
        if (candidates.length >= q.bounds.max_unique_urls) break;
        let canon: { canonical_url: string; domain: string };
        try {
          canon = input.deps.canonicalizeUrl(r.url);
        } catch {
          continue;
        }
        if (seen.has(canon.canonical_url)) continue;
        seen.add(canon.canonical_url);
        const c = input.deps.classifySource({ canonical_url: canon.canonical_url, title: r.title, snippet: r.snippet });
        candidates.push({
          canonical_url: c.canonical_url,
          source_class: c.source_class,
          official_domain_confidence: c.official_domain_confidence,
          search_rank: c.search_rank,
          title: c.title,
          snippet: c.snippet,
          discovery_origin: "search_query",
          discovered_via_query_id: d.query_id
        });
      }
    }
  }

  const selected2 = selectMinimalSourcesV1(candidates).slice(0, q.bounds.max_selected_sources);

  if (selected2.length === 0) {
    const preview: ProgramSurfaceResearchPreviewV1 = {
      research_question_id: q.research_question_id,
      candidate_id: q.candidate_id,
      question_type: q.question_type,
      subject_entity_id: q.subject.entity_id,
      subject_canonical_name: q.subject.canonical_name,
      discovery_queries,
      urls_considered: candidates.length,
      selected_sources: [],
      fetched: [],
      prospective_source_id: "",
      prospective_evidence_reference_id: "",
      evidence_reuse: "NO",
      source_eligibility: "FAIL",
      retention_policy: "blocked",
      raw_html_transient: "NO",
      raw_html_retained: "NO",
      retained_support: "neither",
      normalized_candidates: [],
      claim_previews: [],
      answer_status: candidates.length === 0 ? "NO_DISCOVERY_RESULTS" : "NO_ELIGIBLE_SOURCES",
      answer_reason: candidates.length === 0 ? "no_discovery_results" : "no_eligible_sources_selected"
    };
    return { status: "preview", preview };
  }

  const selectedCanon = selected2[0]!.canonical_url;
  const sel = candidates.find((c) => c.canonical_url === selectedCanon) ?? null;
  if (!sel) {
    const preview: ProgramSurfaceResearchPreviewV1 = {
      research_question_id: q.research_question_id,
      candidate_id: q.candidate_id,
      question_type: q.question_type,
      subject_entity_id: q.subject.entity_id,
      subject_canonical_name: q.subject.canonical_name,
      discovery_queries,
      urls_considered: candidates.length,
      selected_sources: [],
      fetched: [],
      prospective_source_id: "",
      prospective_evidence_reference_id: "",
      evidence_reuse: "NO",
      source_eligibility: "FAIL",
      retention_policy: "blocked",
      raw_html_transient: "NO",
      raw_html_retained: "NO",
      retained_support: "neither",
      normalized_candidates: [],
      claim_previews: [],
      answer_status: "DISCOVERY_UNAVAILABLE",
      answer_reason: "selected_source_missing_from_candidates"
    };
    return { status: "preview", preview };
  }

  const { domain } = input.deps.canonicalizeUrl(sel.canonical_url);
  const source_id = input.deps.computeSourceId({ domain });
  const evidence_reference_id = input.deps.computeEvidenceReferenceId({ source_id, canonical_url: sel.canonical_url });
  const reuse = await input.deps.evidenceReuseLookup({ source_id, canonical_url: sel.canonical_url });

  // Source eligibility is enforced by the program surface predicate policy inside the builder.
  // Here we only ensure we can represent the class.
  const fetchRes = await input.deps.fetchPage({
    canonical_url: sel.canonical_url,
    timeout_ms: q.bounds.fetch_timeout_ms,
    max_bytes: q.bounds.fetch_max_bytes
  });

  if (!fetchRes.ok) {
    // If we started with a canonical-domain seed and the seed fetch failed,
    // fall back to search adapter discovery (within the same bounded budget)
    // to ensure we still have a real first-hop candidate URL.
    if (domainHint && domainHint.ok) {
      // Populate search candidates (excluding the already-tried seed).
      const discovered: Array<{ query_id: string; results: Array<{ url: string; title: string | null; snippet: string | null; rank: number }> }> = [];
      try {
        for (const dq of discovery_queries) {
          const res = await input.deps.discovery.search({ query: dq.query, max_results: q.bounds.max_results_per_query });
          discovered.push({ query_id: dq.query_id, results: res.slice(0, q.bounds.max_results_per_query) });
        }
      } catch {
        // If fallback discovery itself is unavailable, keep the original fetch failure.
      }

      for (const d of discovered) {
        for (const r of d.results) {
          if (candidates.length >= q.bounds.max_unique_urls) break;
          let canon: { canonical_url: string; domain: string };
          try {
            canon = input.deps.canonicalizeUrl(r.url);
          } catch {
            continue;
          }
          if (seen.has(canon.canonical_url)) continue;
          seen.add(canon.canonical_url);
          const c = input.deps.classifySource({ canonical_url: canon.canonical_url, title: r.title, snippet: r.snippet });
          candidates.push({
            canonical_url: c.canonical_url,
            source_class: c.source_class,
            official_domain_confidence: c.official_domain_confidence,
            search_rank: c.search_rank,
            title: c.title,
            snippet: c.snippet,
            discovery_origin: "search_query",
            discovered_via_query_id: d.query_id
          });
        }
      }

      const fallbackSel =
        selectMinimalSourcesV1(candidates.filter((c) => c.canonical_url !== sel.canonical_url))
          .slice(0, q.bounds.max_selected_sources)[0] ?? null;
      if (fallbackSel && fallbackSel.canonical_url !== sel.canonical_url) {
        const fetch2 = await input.deps.fetchPage({
          canonical_url: fallbackSel.canonical_url,
          timeout_ms: q.bounds.fetch_timeout_ms,
          max_bytes: q.bounds.fetch_max_bytes
        });
        if (fetch2.ok) {
          // Replace the failed fetch with the fallback fetch and continue normal processing.
          // NOTE: still bounded to <=2 total fetch attempts; this path uses seed fetch (failed) + fallback fetch (ok).
          // We intentionally do NOT attempt same-domain follow in this branch.
          const fetched2 = fetch2.preview;
          const transient2 = fetch2.transient;

          const previewFetched2 = [fetched2];
          const retention_policy2: ProgramSurfaceResearchPreviewV1["retention_policy"] = "structured_metadata";
          const raw_html_transient2: ProgramSurfaceResearchPreviewV1["raw_html_transient"] = transient2?.raw_html ? "YES" : "NO";

          const supportText2 = [
            fetched2.title ?? "",
            fetched2.meta_description ?? "",
            fetched2.og_title ?? "",
            transient2?.raw_html ? transient2.raw_html.replace(/<[^>]+>/g, " ") : ""
          ].join("\n");

          const normalized2 = normalizeProgramSurfaceFromTextV1({ predicate, text: supportText2 });
          const normalized_candidates_all2 = normalizeToCandidatePreviewV1({ predicate, normalized: normalized2 });
          const normalized_candidates2 = dedupeNormalizedCandidatesV1(normalized_candidates_all2);

          const claim_previews2: ProgramSurfaceResearchPreviewV1["claim_previews"] = [];
          const existing2 = await input.deps.claimLookupByPredicate({ predicate });

          const { domain: d2 } = input.deps.canonicalizeUrl(fetched2.canonical_url);
          const source_id2 = input.deps.computeSourceId({ domain: d2 });
          const evidence_reference_id2 = input.deps.computeEvidenceReferenceId({
            source_id: source_id2,
            canonical_url: fetched2.canonical_url
          });
          const reuse2 = await input.deps.evidenceReuseLookup({ source_id: source_id2, canonical_url: fetched2.canonical_url });

          for (const c of normalized_candidates2) {
            const evidence_version_ref2 = {
              object_type: "evidence_reference",
              object_id: evidence_reference_id2,
              version_id: null,
              content_hash: computeContentHash({
                canonical_url: fetched2.canonical_url,
                final_url: fetched2.final_url,
                http_status: fetched2.http_status,
                title: fetched2.title,
                meta_description: fetched2.meta_description,
                og_site_name: fetched2.og_site_name,
                og_title: fetched2.og_title,
                jsonld_types: fetched2.jsonld_types,
                retention_mode: fetched2.retention_mode
              }),
              schema_version: "evidence_reference_v1",
              policy_version: "legal_policy.unknown",
              created_at: input.now_iso
            } as const;

            let builderOut2:
              | ReturnType<typeof buildProgramSurfaceClaimV1>
              | { status: "rejected"; reason: string };
            try {
              builderOut2 = buildProgramSurfaceClaimV1({
                evidence_version_ref: evidence_version_ref2,
                retrieved_at_iso: input.now_iso,
                subject: q.subject,
                predicate: c.predicate,
                object_value: c.object_value as unknown as ProgramSurfaceObjectValueV1,
                normalization_confidence: c.normalization_confidence,
                evidence_domain: "EXTERNAL",
                external_source_class: fallbackSel.source_class,
                qualifiers: c.qualifiers
              });
            } catch (e) {
              builderOut2 = { status: "rejected", reason: e instanceof Error ? e.message : String(e) };
            }
            if (builderOut2.status !== "eligible") continue;
            const claim = builderOut2.claim as Claim;
            claim_previews2.push({
              predicate: c.predicate,
              object_value: c.object_value,
              qualifiers: c.qualifiers,
              confidence: "high",
              prospective_evidence_reference_id: evidence_reference_id2,
              prospective_evidence_content_hash: evidence_version_ref2.content_hash,
              prospective_claim_id: claim.claim_id,
              prospective_claim_fingerprint: claim.claim_fingerprint,
              prospective_claim_content_hash: computeContentHash(claim),
              semantic_fact_already_present_elsewhere: existing2.claim_count > 0
            });
          }

          const answer_status2: ProgramSurfaceResearchPreviewV1["answer_status"] = claim_previews2.length
            ? "ANSWERED"
            : normalized_candidates2.length
              ? "PARTIAL"
              : "NOT_FOUND_WITHIN_BOUNDED_RESEARCH";

          const fullFallback = candidates.find((c) => c.canonical_url === fallbackSel.canonical_url) ?? null;
          const fallbackOrigin = {
            discovery_origin: fullFallback?.discovery_origin ?? ("search_query" as const),
            discovered_via_query_id: fullFallback?.discovered_via_query_id ?? (null as string | null)
          };

          const preview2: ProgramSurfaceResearchPreviewV1 = {
            research_question_id: q.research_question_id,
            candidate_id: q.candidate_id,
            question_type: q.question_type,
            subject_entity_id: q.subject.entity_id,
            subject_canonical_name: q.subject.canonical_name,
            discovery_queries,
            urls_considered: candidates.length,
            selected_sources: [
              {
                canonical_url: fallbackSel.canonical_url,
                source_class: fallbackSel.source_class,
                discovery_origin: fallbackOrigin.discovery_origin,
                discovered_via_query_id: fallbackOrigin.discovered_via_query_id
              }
            ],
            fetched: previewFetched2,
            prospective_source_id: source_id2,
            prospective_evidence_reference_id: evidence_reference_id2,
            evidence_reuse: reuse2.exists ? "YES" : "NO",
            source_eligibility: "PASS",
            retention_policy: retention_policy2,
            raw_html_transient: raw_html_transient2,
            raw_html_retained: "NO",
            retained_support: transient2?.raw_html ? "structured_metadata" : "neither",
            normalized_candidates: normalized_candidates2,
            claim_previews: claim_previews2,
            answer_status: answer_status2,
            answer_reason: claim_previews2.length
              ? null
              : normalized_candidates2.length
                ? "no_high_confidence_claims"
                : "no_supported_candidates"
          };

          return { status: "preview", preview: preview2 };
        }
      }
    }

    const preview: ProgramSurfaceResearchPreviewV1 = {
      research_question_id: q.research_question_id,
      candidate_id: q.candidate_id,
      question_type: q.question_type,
      subject_entity_id: q.subject.entity_id,
      subject_canonical_name: q.subject.canonical_name,
      discovery_queries,
      urls_considered: candidates.length,
      selected_sources: [
        {
          canonical_url: sel.canonical_url,
          source_class: sel.source_class,
          discovery_origin: sel.discovery_origin,
          discovered_via_query_id: sel.discovered_via_query_id
        }
      ],
      fetched: [],
      prospective_source_id: source_id,
      prospective_evidence_reference_id: evidence_reference_id,
      evidence_reuse: reuse.exists ? "YES" : "NO",
      source_eligibility: "PASS",
      retention_policy: "structured_metadata",
      raw_html_transient: "NO",
      raw_html_retained: "NO",
      retained_support: "neither",
      normalized_candidates: [],
      claim_previews: [],
      answer_status: "FETCH_FAILED",
      answer_reason: fetchRes.error
    };
    return { status: "preview", preview };
  }

  const fetched = fetchRes.preview;
  const transient = fetchRes.transient;

  const previewFetched = [fetched];

  // Retention: V1 uses structured metadata always. Bounded excerpts are derived from raw HTML but not retained here.
  const retention_policy: ProgramSurfaceResearchPreviewV1["retention_policy"] = "structured_metadata";
  const raw_html_transient: ProgramSurfaceResearchPreviewV1["raw_html_transient"] = transient?.raw_html ? "YES" : "NO";

  const supportText = [
    fetched.title ?? "",
    fetched.meta_description ?? "",
    fetched.og_title ?? "",
    // raw_html is execution-only; if present, we can inspect it in-memory but must not return it.
    transient?.raw_html ? transient.raw_html.replace(/<[^>]+>/g, " ") : ""
  ].join("\n");

  const normalized = normalizeProgramSurfaceFromTextV1({ predicate, text: supportText });
  const normalized_candidates_all = normalizeToCandidatePreviewV1({ predicate, normalized });
  const normalized_candidates = dedupeNormalizedCandidatesV1(normalized_candidates_all);

  const claim_previews: ProgramSurfaceResearchPreviewV1["claim_previews"] = [];

  // Existence-aware diagnostic: predicate-level only.
  const existing = await input.deps.claimLookupByPredicate({ predicate });

  for (const c of normalized_candidates) {
    // Build claim preview via deterministic builder.
    const evidence_version_ref = {
      object_type: "evidence_reference",
      object_id: evidence_reference_id,
      version_id: null,
      // Derived from fetched preview (structured only). This is a no-write prospective identity.
      content_hash: computeContentHash({
        canonical_url: fetched.canonical_url,
        final_url: fetched.final_url,
        http_status: fetched.http_status,
        title: fetched.title,
        meta_description: fetched.meta_description,
        og_site_name: fetched.og_site_name,
        og_title: fetched.og_title,
        jsonld_types: fetched.jsonld_types,
        retention_mode: fetched.retention_mode
      }),
      schema_version: "evidence_reference_v1",
      policy_version: "legal_policy.unknown",
      created_at: input.now_iso
    } as const;

    let builderOut:
      | ReturnType<typeof buildProgramSurfaceClaimV1>
      | { status: "rejected"; reason: string };
    try {
      builderOut = buildProgramSurfaceClaimV1({
        evidence_version_ref,
        retrieved_at_iso: input.now_iso,
        subject: q.subject,
        predicate: c.predicate,
        object_value: c.object_value as unknown as ProgramSurfaceObjectValueV1,
        normalization_confidence: c.normalization_confidence,
        evidence_domain: "EXTERNAL",
        external_source_class: sel.source_class,
        qualifiers: c.qualifiers
      });
    } catch (e) {
      builderOut = { status: "rejected", reason: e instanceof Error ? e.message : String(e) };
    }

    // Only HIGH is eligible; MEDIUM yields preview but not persistence-eligible.
    if (builderOut.status !== "eligible") continue;

    const claim = builderOut.claim as Claim;
    claim_previews.push({
      predicate: c.predicate,
      object_value: c.object_value,
      qualifiers: c.qualifiers,
      confidence: "high",
      prospective_evidence_reference_id: evidence_reference_id,
      prospective_evidence_content_hash: evidence_version_ref.content_hash,
      prospective_claim_id: claim.claim_id,
      prospective_claim_fingerprint: claim.claim_fingerprint,
      prospective_claim_content_hash: computeContentHash(claim),
      semantic_fact_already_present_elsewhere: existing.claim_count > 0
    });
  }

  // If unanswered and we have official HTML, attempt one same-domain link-follow (bounded) for RQ_EVENT_FOOTPRINT only.
  if (claim_previews.length === 0 && q.question_type === "RQ_EVENT_FOOTPRINT" && transient?.raw_html) {
    const links = extractSameDomainLinksV1({ base_canonical_url: fetched.canonical_url, raw_html: transient.raw_html, max: 80 });
    const ranked = rankEventFootprintLinksV1(links).slice(0, Math.min(1, q.bounds.max_selected_sources));

    // second fetch cap is governed by question bounds: allow up to 2 total fetches.
    if (ranked[0] && q.bounds.max_selected_sources >= 1) {
      const secondUrl = ranked[0];
      const secondClassified = input.deps.classifySource({ canonical_url: secondUrl, title: null, snippet: null });
      const secondFetch = await input.deps.fetchPage({
        canonical_url: secondUrl,
        timeout_ms: q.bounds.fetch_timeout_ms,
        max_bytes: q.bounds.fetch_max_bytes
      });
      if (secondFetch.ok) {
        // Extend preview fetched list (no raw html).
        previewFetched.push(secondFetch.preview);
        const secondText = [
          secondFetch.preview.title ?? "",
          secondFetch.preview.meta_description ?? "",
          secondFetch.preview.og_title ?? "",
          secondFetch.transient?.raw_html ? secondFetch.transient.raw_html.replace(/<[^>]+>/g, " ") : ""
        ].join("\n");

        const normalized2 = normalizeProgramSurfaceFromTextV1({ predicate, text: secondText });
        const candidates2 = dedupeNormalizedCandidatesV1(normalizeToCandidatePreviewV1({ predicate, normalized: normalized2 }));

        for (const c of candidates2) {
          const { domain: d2 } = input.deps.canonicalizeUrl(secondFetch.preview.canonical_url);
          const source_id2 = input.deps.computeSourceId({ domain: d2 });
          const evidence_reference_id2 = input.deps.computeEvidenceReferenceId({
            source_id: source_id2,
            canonical_url: secondFetch.preview.canonical_url
          });

          const evidence_version_ref2 = {
            object_type: "evidence_reference",
            object_id: evidence_reference_id2,
            version_id: null,
            content_hash: computeContentHash({
              canonical_url: secondFetch.preview.canonical_url,
              final_url: secondFetch.preview.final_url,
              http_status: secondFetch.preview.http_status,
              title: secondFetch.preview.title,
              meta_description: secondFetch.preview.meta_description,
              og_site_name: secondFetch.preview.og_site_name,
              og_title: secondFetch.preview.og_title,
              jsonld_types: secondFetch.preview.jsonld_types,
              retention_mode: secondFetch.preview.retention_mode
            }),
            schema_version: "evidence_reference_v1",
            policy_version: "legal_policy.unknown",
            created_at: input.now_iso
          } as const;

          let builderOut2:
            | ReturnType<typeof buildProgramSurfaceClaimV1>
            | { status: "rejected"; reason: string };

          try {
            builderOut2 = buildProgramSurfaceClaimV1({
              evidence_version_ref: evidence_version_ref2,
              retrieved_at_iso: input.now_iso,
              subject: q.subject,
              predicate: c.predicate,
              object_value: c.object_value as unknown as ProgramSurfaceObjectValueV1,
              normalization_confidence: c.normalization_confidence,
              evidence_domain: "EXTERNAL",
              external_source_class: secondClassified.source_class,
              qualifiers: c.qualifiers
            });
          } catch (e) {
            builderOut2 = { status: "rejected", reason: e instanceof Error ? e.message : String(e) };
          }

          if (builderOut2.status !== "eligible") continue;
          const claim = builderOut2.claim as Claim;
          claim_previews.push({
            predicate: c.predicate,
            object_value: c.object_value,
            qualifiers: c.qualifiers,
            confidence: "high",
            prospective_evidence_reference_id: evidence_reference_id2,
            prospective_evidence_content_hash: evidence_version_ref2.content_hash,
            prospective_claim_id: claim.claim_id,
            prospective_claim_fingerprint: claim.claim_fingerprint,
            prospective_claim_content_hash: computeContentHash(claim),
            semantic_fact_already_present_elsewhere: existing.claim_count > 0
          });
        }
      }
    }
  }

  // If still unanswered and we only used the homepage fetch (no same-domain follow possible),
  // we may use the search adapter as a fallback *only* to source the second fetch candidate.
  // Importantly: a fallback search failure must not erase completed official-domain research.
  if (claim_previews.length === 0 && q.question_type === "RQ_EVENT_FOOTPRINT" && previewFetched.length === 1) {
    const discovered: Array<{ query_id: string; results: Array<{ url: string; title: string | null; snippet: string | null; rank: number }> }> = [];
    try {
      for (const dq of discovery_queries) {
        const res = await input.deps.discovery.search({ query: dq.query, max_results: q.bounds.max_results_per_query });
        discovered.push({ query_id: dq.query_id, results: res.slice(0, q.bounds.max_results_per_query) });
      }
    } catch (e) {
      discoveryDiagnostic = `search_fallback_failed:${e instanceof Error ? e.message : String(e)}`;
    }

    if (!discoveryDiagnostic) {
      // Take the best-ranked eligible URL and spend the one remaining fetch budget.
      for (const d of discovered) {
        for (const r of d.results) {
          if (candidates.length >= q.bounds.max_unique_urls) break;
          let canon: { canonical_url: string; domain: string };
          try {
            canon = input.deps.canonicalizeUrl(r.url);
          } catch {
            continue;
          }
          if (seen.has(canon.canonical_url)) continue;
          seen.add(canon.canonical_url);
          const c = input.deps.classifySource({ canonical_url: canon.canonical_url, title: r.title, snippet: r.snippet });
          candidates.push({
            canonical_url: c.canonical_url,
            source_class: c.source_class,
            official_domain_confidence: c.official_domain_confidence,
            search_rank: c.search_rank,
            title: c.title,
            snippet: c.snippet,
            discovery_origin: "search_query",
            discovered_via_query_id: d.query_id
          });
        }
      }

      const fallbackSel =
        selectMinimalSourcesV1(candidates.filter((c) => c.canonical_url !== sel.canonical_url))
          .slice(0, q.bounds.max_selected_sources)[0] ?? null;

      if (fallbackSel) {
        const secondFetch = await input.deps.fetchPage({
          canonical_url: fallbackSel.canonical_url,
          timeout_ms: q.bounds.fetch_timeout_ms,
          max_bytes: q.bounds.fetch_max_bytes
        });

        if (secondFetch.ok) {
          previewFetched.push(secondFetch.preview);

          const secondText = [
            secondFetch.preview.title ?? "",
            secondFetch.preview.meta_description ?? "",
            secondFetch.preview.og_title ?? "",
            secondFetch.transient?.raw_html ? secondFetch.transient.raw_html.replace(/<[^>]+>/g, " ") : ""
          ].join("\n");

          const normalized2 = normalizeProgramSurfaceFromTextV1({ predicate, text: secondText });
          const candidates2 = dedupeNormalizedCandidatesV1(normalizeToCandidatePreviewV1({ predicate, normalized: normalized2 }));

          for (const c of candidates2) {
            const { domain: d2 } = input.deps.canonicalizeUrl(secondFetch.preview.canonical_url);
            const source_id2 = input.deps.computeSourceId({ domain: d2 });
            const evidence_reference_id2 = input.deps.computeEvidenceReferenceId({
              source_id: source_id2,
              canonical_url: secondFetch.preview.canonical_url
            });

            const evidence_version_ref2 = {
              object_type: "evidence_reference",
              object_id: evidence_reference_id2,
              version_id: null,
              content_hash: computeContentHash({
                canonical_url: secondFetch.preview.canonical_url,
                final_url: secondFetch.preview.final_url,
                http_status: secondFetch.preview.http_status,
                title: secondFetch.preview.title,
                meta_description: secondFetch.preview.meta_description,
                og_site_name: secondFetch.preview.og_site_name,
                og_title: secondFetch.preview.og_title,
                jsonld_types: secondFetch.preview.jsonld_types,
                retention_mode: secondFetch.preview.retention_mode
              }),
              schema_version: "evidence_reference_v1",
              policy_version: "legal_policy.unknown",
              created_at: input.now_iso
            } as const;

            let builderOut2:
              | ReturnType<typeof buildProgramSurfaceClaimV1>
              | { status: "rejected"; reason: string };

            try {
              builderOut2 = buildProgramSurfaceClaimV1({
                evidence_version_ref: evidence_version_ref2,
                retrieved_at_iso: input.now_iso,
                subject: q.subject,
                predicate: c.predicate,
                object_value: c.object_value as unknown as ProgramSurfaceObjectValueV1,
                normalization_confidence: c.normalization_confidence,
                evidence_domain: "EXTERNAL",
                external_source_class: fallbackSel.source_class,
                qualifiers: c.qualifiers
              });
            } catch (e) {
              builderOut2 = { status: "rejected", reason: e instanceof Error ? e.message : String(e) };
            }

            if (builderOut2.status !== "eligible") continue;
            const claim = builderOut2.claim as Claim;
            claim_previews.push({
              predicate: c.predicate,
              object_value: c.object_value,
              qualifiers: c.qualifiers,
              confidence: "high",
              prospective_evidence_reference_id: evidence_reference_id2,
              prospective_evidence_content_hash: evidence_version_ref2.content_hash,
              prospective_claim_id: claim.claim_id,
              prospective_claim_fingerprint: claim.claim_fingerprint,
              prospective_claim_content_hash: computeContentHash(claim),
              semantic_fact_already_present_elsewhere: existing.claim_count > 0
            });
          }
        }
      }
    }
  }

  const answer_status: ProgramSurfaceResearchPreviewV1["answer_status"] = claim_previews.length
    ? "ANSWERED"
    : candidates.length === 0
      ? "NO_DISCOVERY_RESULTS"
      : selected.length === 0
        ? "NO_ELIGIBLE_SOURCES"
        : normalized_candidates.length
          ? "PARTIAL"
          : "NOT_FOUND_WITHIN_BOUNDED_RESEARCH";

  const baseReason = claim_previews.length ? null : normalized_candidates.length ? "no_high_confidence_claims" : "no_supported_candidates";
  const answer_reason =
    baseReason && discoveryDiagnostic ? `${baseReason};${discoveryDiagnostic}` : baseReason ?? discoveryDiagnostic;

  const preview: ProgramSurfaceResearchPreviewV1 = {
    research_question_id: q.research_question_id,
    candidate_id: q.candidate_id,
    question_type: q.question_type,
    subject_entity_id: q.subject.entity_id,
    subject_canonical_name: q.subject.canonical_name,
    discovery_queries,
    urls_considered: candidates.length,
    selected_sources: [
      {
        canonical_url: sel.canonical_url,
        source_class: sel.source_class,
        discovery_origin: sel.discovery_origin,
        discovered_via_query_id: sel.discovered_via_query_id
      }
    ],
    fetched: previewFetched,
    prospective_source_id: source_id,
    prospective_evidence_reference_id: evidence_reference_id,
    evidence_reuse: reuse.exists ? "YES" : "NO",
    source_eligibility: "PASS",
    retention_policy,
    raw_html_transient,
    raw_html_retained: "NO",
    retained_support: transient?.raw_html ? "structured_metadata" : "neither",
    normalized_candidates,
    claim_previews,
    answer_status,
    answer_reason
  };

  return { status: "preview", preview };
}
