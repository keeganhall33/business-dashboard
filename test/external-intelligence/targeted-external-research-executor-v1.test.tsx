import test from "node:test";
import assert from "node:assert/strict";

import type { EntityRef } from "@/lib/external-intelligence/contracts/entity-ref";
import type { ResearchDiscoveryProviderV1 } from "@/lib/external-intelligence/targeted-research/discovery-provider-v1";
import { planOrganizationContextDiscoveryQueriesV1 } from "@/lib/external-intelligence/targeted-research/discovery-templates-v1";
import { canonicalizeUrlV1 } from "@/lib/external-intelligence/targeted-research/url-canonicalization-v1";
import { classifySourceCandidateV1 } from "@/lib/external-intelligence/targeted-research/source-classification-v1";
import { executeTargetedExternalResearchPreviewV1 } from "@/lib/external-intelligence/targeted-research/targeted-external-research-executor-v1";

const MockDiscovery: ResearchDiscoveryProviderV1 = {
  kind: "mock",
  search: async () => [
    { url: "https://example.com/?utm_source=x", title: "Premier Padel - Home", snippet: "snippet", rank: 1 },
    { url: "https://news.example.com/story", title: "Some news", snippet: "snippet", rank: 2 }
  ]
};

test("discovery templates are deterministic and bounded to 3", () => {
  const q = planOrganizationContextDiscoveryQueriesV1({ organization_name: "Premier Padel" });
  assert.equal(q.length, 3);
  assert.equal(q[0]?.query, "Premier Padel official site");
});

test("url canonicalization strips utm and fragments", () => {
  const c = canonicalizeUrlV1("https://example.com/path?a=1&utm_source=x#frag");
  assert.equal(c.canonical_url, "https://example.com/path?a=1");
});

test("source classification is conservative (does not promote unknown domains to official high)", () => {
  const c = classifySourceCandidateV1({
    canonical_url: "https://random.com/",
    domain: "random.com",
    org_name: "Premier Padel",
    title: "Premier Padel"
  });
  assert.notEqual(c.official_domain_confidence, "high");
});

test("executor blocks AGENCY_SCOPE when bounded excerpt source is not eligible", async () => {
  const res = await executeTargetedExternalResearchPreviewV1({
    research_question: {
      question_type: "AGENCY_SCOPE",
      source_domain: "EXTERNAL",
      research_question_id: "rq",
      question_text: "",
      subject_entity_refs: [],
      source_missing_intelligence_category: "agency_scope"
    },
    candidate_id: "c",
    subject: ({ entity_id: "provisional:organization:x", entity_type: "organization", canonical_name: "Premier Padel" } as unknown) as EntityRef,
    now_iso: new Date().toISOString(),
    deps: {
      discovery: MockDiscovery,
      evidenceReuseLookup: async () => ({ exists: false })
    },
    bounds: {
      max_queries: 3,
      max_results_per_query: 5,
      max_unique_urls: 10,
      max_selected_sources: 1,
      fetch_timeout_ms: 1,
      fetch_max_bytes: 10
    }
  });

  assert.equal(res.status, "blocked");
});
