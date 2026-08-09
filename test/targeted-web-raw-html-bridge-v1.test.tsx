import assert from "node:assert/strict";
import test from "node:test";

import { fetchPagePreviewV1 } from "@/lib/external-intelligence/targeted-research/page-fetcher-v1";
import { executeTargetedExternalResearchPreviewV1 } from "@/lib/external-intelligence/targeted-research/targeted-external-research-executor-v1";

function makeFetchResponse(input: { status: number; contentType: string | null; body: string }): Response {
  const headers = new Headers();
  if (input.contentType) headers.set("content-type", input.contentType);
  return new Response(input.body, { status: input.status, headers });
}

test("page-fetcher-v1: exposes transient.raw_html only for allowed HTML content types", async () => {
  const fetchMock = async () =>
    makeFetchResponse({
      status: 200,
      contentType: "text/html; charset=utf-8",
      body: "<html><head><title>T</title></head><body>ok</body></html>"
    });

  // @ts-expect-error test shim
  globalThis.fetch = fetchMock;

  const out = await fetchPagePreviewV1({ canonical_url: "https://www.sportspro.com/x", timeout_ms: 5000, max_bytes: 1024 * 1024 });
  assert.equal(out.ok, true);
  if (out.ok) {
    assert.equal(out.preview.http_status, 200);
    assert.ok(out.transient?.raw_html.includes("<html"));
  }

  // JSON content-type should not expose transient raw html.
  const fetchMock2 = async () => makeFetchResponse({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
  // @ts-expect-error test shim
  globalThis.fetch = fetchMock2;

  const out2 = await fetchPagePreviewV1({ canonical_url: "https://www.sportspro.com/y", timeout_ms: 5000, max_bytes: 1024 * 1024 });
  assert.equal(out2.ok, true);
  if (out2.ok) {
    assert.equal(out2.transient, null);
  }
});

test("page-fetcher-v1: enforces max_bytes cap", async () => {
  const big = "x".repeat(1000);
  const fetchMock = async () => makeFetchResponse({ status: 200, contentType: "text/html", body: big });
  // @ts-expect-error test shim
  globalThis.fetch = fetchMock;

  const out = await fetchPagePreviewV1({ canonical_url: "https://www.sportspro.com/big", timeout_ms: 5000, max_bytes: 10 });
  assert.equal(out.ok, false);
  if (!out.ok) {
    assert.equal(out.error, "response_too_large");
  }
});

test("executor: uses transient html to derive bounded excerpts, but does not forward raw html in preview payload", async () => {
  // Mock discovery: single SportsPro result.
  const discovery = {
    search: async () => [
      {
        url: "https://www.sportspro.com/news/premier-padel-ten-toes/",
        title: "Premier Padel appoints Ten Toes",
        snippet: "Ten Toes appointed.",
        rank: 1
      }
    ]
  };

  // Mock fetch: include the exact strings the support extractor looks for.
  const html = `
    <html>
      <head><title>Premier Padel x Ten Toes</title></head>
      <body>
        <p>Ten Toes will lead content and channel strategy.</p>
        <p>The partnership includes campaign delivery.</p>
        <p>It also covers campaign planning and execution.</p>
      </body>
    </html>
  `;

  const fetchMock = async () => makeFetchResponse({ status: 200, contentType: "text/html; charset=utf-8", body: html });
  // @ts-expect-error test shim
  globalThis.fetch = fetchMock;

  const res = await executeTargetedExternalResearchPreviewV1({
    research_question: {
      research_question_id: "rq:test",
      planner_policy_version: "p",
      candidate_id: "cand:test",
      question_type: "AGENCY_SCOPE",
      question_text: "q",
      subject_entity_refs: [
        { entity_id: "org:premier_padel", entity_type: "organization", canonical_name: "Premier Padel" },
        { entity_id: "org:ten_toes", entity_type: "organization", canonical_name: "Ten Toes" }
      ],
      source_missing_intelligence_category: "agency_scope",
      decision_target: "candidate_rejection",
      priority: "GATE",
      answer_type: "STRUCTURED_FACT_SET",
      source_domain: "EXTERNAL",
      acceptable_source_classes: ["official_website"],
      freshness: "CURRENT",
      dependencies: [],
      stop_conditions: []
    },
    candidate_id: "cand:test",
    subject: { entity_id: "org:ten_toes", entity_type: "organization", canonical_name: "Ten Toes" },
    now_iso: "2026-08-09T20:51:00.000Z",
    deps: { discovery: discovery as never, evidenceReuseLookup: async () => ({ exists: false }) },
    bounds: {
      max_queries: 1,
      max_results_per_query: 1,
      max_unique_urls: 1,
      max_selected_sources: 1,
      fetch_timeout_ms: 5000,
      fetch_max_bytes: 1024 * 1024
    }
  });

  assert.equal(res.status, "preview");
  if (res.status !== "preview") throw new Error("unexpected");

  // The preview payload must not include raw HTML.
  const fetched0 = res.preview.fetched[0] as unknown as Record<string, unknown>;
  assert.ok(fetched0);
  assert.equal(Object.prototype.hasOwnProperty.call(fetched0, "raw_html"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(fetched0, "transient"), false);

  // And it must propose exactly content + campaign_strategy (no social/experiential).
  const scopes = res.preview.proposed_service_scope_claims.map((c) => c.service_scope).slice().sort();
  assert.deepEqual(scopes, ["campaign_strategy", "content"]);
});
