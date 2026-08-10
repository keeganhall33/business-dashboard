#!/usr/bin/env tsx
/**
 * Controlled proof (NO-WRITE): Premier Padel RQ_EVENT_FOOTPRINT.
 *
 * Safety contract:
 * - Performs bounded discovery + one fetch
 * - Produces preview only: NO evidence persistence, NO claim persistence
 * - Does not return raw HTML
 */

import crypto from "node:crypto";
import assert from "node:assert";

import { createClient } from "@supabase/supabase-js";

import { buildProvisionalEntityRefV1 } from "@/lib/external-intelligence/contracts/entity-ref-provisional";
import {
  DEFAULT_PROGRAM_SURFACE_QUESTION_BOUNDS_V1,
  PROGRAM_SURFACE_RESEARCH_POLICY_VERSION_V1
} from "@/lib/external-intelligence/program-surfaces/program-surface-research-policy-v1";
import { executeProgramSurfaceResearchPreviewV1 } from "@/lib/external-intelligence/program-surfaces/program-surface-research-executor-v1";
import type { ProgramSurfaceResearchQuestionV1 } from "@/lib/external-intelligence/program-surfaces/program-surface-research-contracts-v1";
import type { ResearchDiscoveryProviderV1 } from "@/lib/external-intelligence/targeted-research/discovery-provider-v1";
import type { DiscoveryResultV1 } from "@/lib/external-intelligence/targeted-research/targeted-research-contracts-v1";
import { classifySourceCandidateV1 } from "@/lib/external-intelligence/targeted-research/source-classification-v1";
import {
  canonicalizeUrlV1,
  computeTargetedWebEvidenceReferenceIdV1,
  computeTargetedWebSourceIdV1
} from "@/lib/external-intelligence/targeted-research/url-canonicalization-v1";
import { fetchPagePreviewV1 } from "@/lib/external-intelligence/targeted-research/page-fetcher-v1";

function sha256Hex(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

function parseDuckDuckGoHtmlResults(html: string): DiscoveryResultV1[] {
  const out: DiscoveryResultV1[] = [];
  const re = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  let rank = 1;
  while ((m = re.exec(html)) !== null) {
    const url = m[1] ?? "";
    const titleRaw = (m[2] ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (!url) continue;
    out.push({ url, title: titleRaw || null, snippet: null, rank });
    rank += 1;
    if (out.length >= 5) break;
  }
  return out;
}

const DuckDuckGoDiscoveryProvider: ResearchDiscoveryProviderV1 = {
  kind: "duckduckgo_html_v1",
  search: async (input) => {
    const q = encodeURIComponent(input.query);
    const url = `https://duckduckgo.com/html/?q=${q}`;
    const res = await fetch(url, { headers: { "user-agent": "keegan-dashboard-targeted-research/1.0" } });
    if (!res.ok) return [];
    const html = await res.text();
    return parseDuckDuckGoHtmlResults(html).slice(0, input.max_results);
  }
};

function redactedHost(url: string) {
  try {
    const u = new URL(url);
    return u.host;
  } catch {
    return "<unknown>";
  }
}

async function countPredicateClaims(supabase: ReturnType<typeof createClient>, predicate: string) {
  const { count, error } = await supabase
    .from("external_claim_versions_v1")
    .select("claim_id", { count: "exact", head: true })
    .filter("payload_json->>predicate", "eq", predicate);
  if (error) throw error;
  return count ?? 0;
}

async function main() {
  const now = new Date().toISOString();

  // Optional: allow production existing-fact diagnostic when creds provided.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  let supabase: ReturnType<typeof createClient> | null = null;
  if (url && key) {
    assert(url.includes("ibjsjosplgbqevmnvvpf.supabase.co"), "unexpected_supabase_project_ref");
    supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  }

  const subject = buildProvisionalEntityRefV1({
    entity_id: "provisional:organization:premier_padel",
    entity_type: "organization",
    canonical_name: "Premier Padel"
  });

  const q: ProgramSurfaceResearchQuestionV1 = {
    research_question_id: `rq_${sha256Hex("premier-padel:event-footprint").slice(0, 12)}`,
    candidate_id: "oppcand:agency_relationship_signal:cfed0d74d8f4d4848f660437",
    question_type: "RQ_EVENT_FOOTPRINT",
    subject,
    discovery_hints: {
      // Discovery hint only. Must NOT be treated as evidence.
      canonical_domain: "premierpadel.com"
    },
    question_policy_version: PROGRAM_SURFACE_RESEARCH_POLICY_VERSION_V1,
    question_text: "Does Premier Padel operate a structured recurring/ongoing event/tour/tournament program?",
    source_domain: "EXTERNAL",
    bounds: { ...DEFAULT_PROGRAM_SURFACE_QUESTION_BOUNDS_V1 }
  };

  const out = await executeProgramSurfaceResearchPreviewV1({
    question: q,
    now_iso: now,
    deps: {
      discovery: DuckDuckGoDiscoveryProvider,
      evidenceReuseLookup: async () => ({ exists: false }),
      claimLookupByPredicate: async ({ predicate }) => ({ claim_count: supabase ? await countPredicateClaims(supabase, predicate) : 0 }),
      fetchPage: async ({ canonical_url, timeout_ms, max_bytes }) => fetchPagePreviewV1({ canonical_url, timeout_ms, max_bytes }),
      classifySource: ({ canonical_url, title, snippet }) =>
        (() => {
          void snippet;
          const { domain } = canonicalizeUrlV1(canonical_url);
          const cls = classifySourceCandidateV1({
            canonical_url,
            domain,
            org_name: "Premier Padel",
            title
          });

          return {
            url: canonical_url,
            canonical_url,
            domain,
            title,
            snippet: null,
            discovered_via_query_id: "q",
            search_rank: 1,
            source_class: cls.source_class,
            official_domain_confidence: cls.official_domain_confidence,
            selection_status: "considered",
            rejection_reason: null
          };
        })(),
      canonicalizeUrl: (u) => canonicalizeUrlV1(u),
      computeSourceId: ({ domain }) => computeTargetedWebSourceIdV1(domain),
      computeEvidenceReferenceId: ({ source_id, canonical_url }) =>
        computeTargetedWebEvidenceReferenceIdV1({ source_id, canonical_url })
    }
  });

  // Safe output only.
  if (out.status !== "preview") {
    console.log(JSON.stringify(out, null, 2));
    return;
  }

  console.log(
    JSON.stringify(
      {
        mode: "no_write_preview",
        supabase_host: url ? redactedHost(url) : null,
        preview: out.preview
      },
      null,
      2
    )
  );
}

main().catch((e) => {
  console.error("preview failed", { error: e?.message ?? String(e) });
  process.exitCode = 1;
});
