import test from "node:test";
import assert from "node:assert/strict";

import { executeProgramSurfaceResearchPreviewV1 } from "@/lib/external-intelligence/program-surfaces/program-surface-research-executor-v1";
import { DEFAULT_PROGRAM_SURFACE_QUESTION_BOUNDS_V1, PROGRAM_SURFACE_RESEARCH_POLICY_VERSION_V1 } from "@/lib/external-intelligence/program-surfaces/program-surface-research-policy-v1";
import {
  canonicalizeUrlV1,
  computeTargetedWebEvidenceReferenceIdV1,
  computeTargetedWebSourceIdV1
} from "@/lib/external-intelligence/targeted-research/url-canonicalization-v1";
import type { ExternalSourceClassV1 } from "@/lib/external-intelligence/targeted-research/targeted-research-contracts-v1";

const ORG = {
  entity_id: "provisional:organization:o1",
  entity_type: "organization",
  canonical_name: "Example Org",
  aliases: [],
  alias_provenance: [],
  source_specific_ids: {},
  entity_resolution_version: "entity_resolution_v1.provisional_only",
  resolution_status: "unresolved",
  possible_entity_ids: [],
  ambiguity_flags: [],
  resolution_confidence: {
    level: "possible",
    bounded_score: null,
    reasons: ["fixture"],
    blockers: [],
    missing_evidence_ids: [],
    supporting_reference_ids: [],
    contradicting_reference_ids: []
  },
  last_verified_at: null,
  valid_from: null,
  valid_until: null
} as const;

function mkQuestion(question_type: unknown) {
  return {
    research_question_id: "rq_1",
    candidate_id: "cand_1",
    question_type,
    subject: ORG,
    question_policy_version: PROGRAM_SURFACE_RESEARCH_POLICY_VERSION_V1,
    question_text: "fixture",
    source_domain: "EXTERNAL",
    bounds: { ...DEFAULT_PROGRAM_SURFACE_QUESTION_BOUNDS_V1 }
  };
}

function mkDeps(input: { htmlByUrl: Record<string, string>; sourceClassByUrl?: Record<string, string> }) {
  return {
    discovery: {
      search: async ({ query, max_results }: { query: string; max_results: number }) => {
        void query;
        const urls = Object.keys(input.htmlByUrl);
        return urls.slice(0, max_results).map((url, i) => ({ url, title: "t", snippet: null, rank: i + 1 }));
      }
    },
    evidenceReuseLookup: async () => ({ exists: false }),
    claimLookupByPredicate: async () => ({ claim_count: 0 }),
    fetchPage: async ({ canonical_url, timeout_ms, max_bytes }: { canonical_url: string; timeout_ms: number; max_bytes: number }) => {
      void timeout_ms;
      void max_bytes;
      const html = input.htmlByUrl[canonical_url];
      assert.ok(html, `missing fixture html for ${canonical_url}`);
      // Reuse production fetcher preview shape (but bypass network).
      const preview = {
        canonical_url,
        http_status: 200,
        final_url: canonical_url,
        content_type: "text/html",
        retention_mode: "structured_metadata" as const,
        title: "title",
        meta_description: null,
        og_site_name: null,
        og_title: null,
        jsonld_types: []
      };
      return { ok: true as const, preview, transient: { raw_html: html }, retention_mode: "structured_metadata" as const };
    },
    classifySource: ({ canonical_url, title, snippet }: { canonical_url: string; title: string | null; snippet: string | null }) => {
      void title;
      void snippet;
      const override = (input.sourceClassByUrl?.[canonical_url] ?? "OFFICIAL_WEBSITE") as ExternalSourceClassV1;
      return {
        canonical_url,
        domain: canonicalizeUrlV1(canonical_url).domain,
        source_class: override,
        official_domain_confidence: "high",
        discovered_via_query_id: "q1",
        search_rank: 1,
        title: null,
        snippet: null,
        schema_version: "research_source_candidate_v1"
      };
    },
    canonicalizeUrl: (u: string) => canonicalizeUrlV1(u),
    computeSourceId: ({ domain }: { domain: string }) => computeTargetedWebSourceIdV1(domain),
    computeEvidenceReferenceId: ({ source_id, canonical_url }: { source_id: string; canonical_url: string }) =>
      computeTargetedWebEvidenceReferenceIdV1({ source_id, canonical_url })
  };
}

test("A. partner roster only => NO runs_partner_activations claim preview", async () => {
  const url = "https://example.com/partners";
  const html = `<html><body><h1>Partners</h1><p>Our official partners are A, B and C.</p></body></html>`;
  const deps = mkDeps({ htmlByUrl: { [url]: html } });
  const out = await executeProgramSurfaceResearchPreviewV1({
    question: mkQuestion("RQ_PARTNERSHIP_ACTIVATION"),
    now_iso: new Date().toISOString(),
    deps
  });
  assert.equal(out.status, "preview");
  assert.equal(out.preview.claim_previews.length, 0);
});

test("B. explicit partner activation => runs_partner_activations preview", async () => {
  const url = "https://example.com/activation";
  const html = `<html><body><p>We deliver sponsor activation through campaign integration and branded experiences.</p></body></html>`;
  const deps = mkDeps({ htmlByUrl: { [url]: html }, sourceClassByUrl: { [url]: "OFFICIAL_PARTNER_PAGE" } });
  const out = await executeProgramSurfaceResearchPreviewV1({
    question: mkQuestion("RQ_PARTNERSHIP_ACTIVATION"),
    now_iso: new Date().toISOString(),
    deps
  });
  assert.equal(out.status, "preview");
  assert.ok(out.preview.claim_previews.some((c) => c.predicate === "runs_partner_activations"));
});

test("C. one-off event => NO operates_event_program", async () => {
  const url = "https://example.com/news";
  const html = `<html><body><p>Example Org hosted Tournament X on June 4, 2026.</p></body></html>`;
  const deps = mkDeps({ htmlByUrl: { [url]: html }, sourceClassByUrl: { [url]: "OFFICIAL_NEWSROOM" } });
  const out = await executeProgramSurfaceResearchPreviewV1({
    question: mkQuestion("RQ_EVENT_FOOTPRINT"),
    now_iso: new Date().toISOString(),
    deps
  });
  assert.equal(out.status, "preview");
  assert.equal(out.preview.claim_previews.length, 0);
});

test("D. structured tour language => operates_event_program/tour preview", async () => {
  const url = "https://example.com/tour";
  const html = `<html><body><p>Example Org is a global tour with a calendar of tournaments across the season.</p></body></html>`;
  const deps = mkDeps({ htmlByUrl: { [url]: html }, sourceClassByUrl: { [url]: "OFFICIAL_EVENT_PAGE" } });
  const out = await executeProgramSurfaceResearchPreviewV1({
    question: mkQuestion("RQ_EVENT_FOOTPRINT"),
    now_iso: new Date().toISOString(),
    deps
  });
  assert.equal(out.status, "preview");
  assert.ok(out.preview.claim_previews.some((c) => c.predicate === "operates_event_program" && c.object_value === "tour"));
});

test("E. VIP attendee only => NO offers_vip_hospitality", async () => {
  const url = "https://example.com/post";
  const html = `<html><body><p>VIP guests attended the event.</p></body></html>`;
  const deps = mkDeps({ htmlByUrl: { [url]: html }, sourceClassByUrl: { [url]: "OFFICIAL_NEWSROOM" } });
  const out = await executeProgramSurfaceResearchPreviewV1({
    question: mkQuestion("RQ_VIP_HOSPITALITY"),
    now_iso: new Date().toISOString(),
    deps
  });
  assert.equal(out.status, "preview");
  assert.equal(out.preview.claim_previews.length, 0);
});

test("F. VIP offering => offers_vip_hospitality preview", async () => {
  const url = "https://example.com/vip";
  const html = `<html><body><p>VIP packages and hospitality packages are available.</p></body></html>`;
  const deps = mkDeps({ htmlByUrl: { [url]: html }, sourceClassByUrl: { [url]: "OFFICIAL_EVENT_PAGE" } });
  const out = await executeProgramSurfaceResearchPreviewV1({
    question: mkQuestion("RQ_VIP_HOSPITALITY"),
    now_iso: new Date().toISOString(),
    deps
  });
  assert.equal(out.status, "preview");
  assert.ok(out.preview.claim_previews.some((c) => c.predicate === "offers_vip_hospitality"));
});

test("G. one-off fundraiser => NO runs_philanthropy_program", async () => {
  const url = "https://example.com/fundraiser";
  const html = `<html><body><p>We held a fundraiser on May 2, 2026.</p></body></html>`;
  const deps = mkDeps({ htmlByUrl: { [url]: html }, sourceClassByUrl: { [url]: "OFFICIAL_NEWSROOM" } });
  const out = await executeProgramSurfaceResearchPreviewV1({
    question: mkQuestion("RQ_PHILANTHROPY_FUNDRAISING"),
    now_iso: new Date().toISOString(),
    deps
  });
  assert.equal(out.status, "preview");
  assert.equal(out.preview.claim_previews.length, 0);
});

test("H. standing foundation => runs_philanthropy_program/foundation preview", async () => {
  const url = "https://example.com/foundation";
  const html = `<html><body><p>The Example Org Foundation supports social impact programs.</p></body></html>`;
  const deps = mkDeps({ htmlByUrl: { [url]: html }, sourceClassByUrl: { [url]: "OFFICIAL_WEBSITE" } });
  const out = await executeProgramSurfaceResearchPreviewV1({
    question: mkQuestion("RQ_PHILANTHROPY_FUNDRAISING"),
    now_iso: new Date().toISOString(),
    deps
  });
  assert.equal(out.status, "preview");
  assert.ok(out.preview.claim_previews.some((c) => c.predicate === "runs_philanthropy_program" && c.object_value === "foundation"));
});

test("I. hosted at third-party venue => NO operates_physical_environment", async () => {
  const url = "https://example.com/event";
  const html = `<html><body><p>The tournament was held at Arena X.</p></body></html>`;
  const deps = mkDeps({ htmlByUrl: { [url]: html }, sourceClassByUrl: { [url]: "OFFICIAL_EVENT_PAGE" } });
  const out = await executeProgramSurfaceResearchPreviewV1({
    question: mkQuestion("RQ_PHYSICAL_ENVIRONMENT"),
    now_iso: new Date().toISOString(),
    deps
  });
  assert.equal(out.status, "preview");
  assert.equal(out.preview.claim_previews.length, 0);
});

test("J. owned property => operates_physical_environment/hotel + owned preview", async () => {
  const url = "https://example.com/hotel";
  const html = `<html><body><p>We own and operate a hotel.</p></body></html>`;
  const deps = mkDeps({ htmlByUrl: { [url]: html }, sourceClassByUrl: { [url]: "OFFICIAL_WEBSITE" } });
  const out = await executeProgramSurfaceResearchPreviewV1({
    question: mkQuestion("RQ_PHYSICAL_ENVIRONMENT"),
    now_iso: new Date().toISOString(),
    deps
  });
  assert.equal(out.status, "preview");
  assert.ok(out.preview.claim_previews.some((c) => c.predicate === "operates_physical_environment" && c.object_value === "hotel"));
});

test("K. one anniversary => NO runs_commemoration_program", async () => {
  const url = "https://example.com/anniversary";
  const html = `<html><body><p>We celebrated our 50th anniversary in 2026.</p></body></html>`;
  const deps = mkDeps({ htmlByUrl: { [url]: html }, sourceClassByUrl: { [url]: "OFFICIAL_NEWSROOM" } });
  const out = await executeProgramSurfaceResearchPreviewV1({
    question: mkQuestion("RQ_COMMEMORATION_PROGRAM"),
    now_iso: new Date().toISOString(),
    deps
  });
  assert.equal(out.status, "preview");
  assert.equal(out.preview.claim_previews.length, 0);
});

test("L. annual induction => runs_commemoration_program + recurrence preview", async () => {
  const url = "https://example.com/induction";
  const html = `<html><body><p>Each year we run an induction program to honor members.</p></body></html>`;
  const deps = mkDeps({ htmlByUrl: { [url]: html }, sourceClassByUrl: { [url]: "OFFICIAL_WEBSITE" } });
  const out = await executeProgramSurfaceResearchPreviewV1({
    question: mkQuestion("RQ_COMMEMORATION_PROGRAM"),
    now_iso: new Date().toISOString(),
    deps
  });
  assert.equal(out.status, "preview");
  assert.ok(out.preview.claim_previews.some((c) => c.predicate === "runs_commemoration_program"));
});

test("guard: executor never returns raw_html in preview", async () => {
  const url = "https://example.com/tour";
  const html = `<html><body><p>Example Org is a global tour with a calendar of tournaments.</p></body></html>`;
  const deps = mkDeps({ htmlByUrl: { [url]: html }, sourceClassByUrl: { [url]: "OFFICIAL_EVENT_PAGE" } });
  const out = await executeProgramSurfaceResearchPreviewV1({
    question: mkQuestion("RQ_EVENT_FOOTPRINT"),
    now_iso: new Date().toISOString(),
    deps
  });
  assert.equal(out.status, "preview");
  const s = JSON.stringify(out.preview);
  assert.ok(!s.includes("<html"));
});

test("status semantics: discovery unavailable != NOT_FOUND_WITHIN_BOUNDED_RESEARCH", async () => {
  const deps = {
    ...mkDeps({ htmlByUrl: { "https://example.com/tour": "<html></html>" } }),
    discovery: {
      search: async () => {
        throw new Error("discovery_adapter_missing");
      }
    }
  };

  const out = await executeProgramSurfaceResearchPreviewV1({
    question: mkQuestion("RQ_EVENT_FOOTPRINT"),
    now_iso: new Date().toISOString(),
    deps
  });

  assert.equal(out.status, "preview");
  assert.equal(out.preview.answer_status, "DISCOVERY_UNAVAILABLE");
});

test("status semantics: zero discovery results => NO_DISCOVERY_RESULTS (not NOT_FOUND)", async () => {
  const deps = {
    ...mkDeps({ htmlByUrl: { "https://example.com/tour": "<html></html>" } }),
    discovery: {
      search: async () => []
    }
  };

  const out = await executeProgramSurfaceResearchPreviewV1({
    question: mkQuestion("RQ_EVENT_FOOTPRINT"),
    now_iso: new Date().toISOString(),
    deps
  });

  assert.equal(out.status, "preview");
  assert.equal(out.preview.urls_considered, 0);
  assert.equal(out.preview.answer_status, "NO_DISCOVERY_RESULTS");
});
