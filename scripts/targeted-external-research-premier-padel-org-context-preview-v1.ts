#!/usr/bin/env tsx
/**
 * Controlled proof (local script):
 * - Regenerates production candidates and research plans (read-only)
 * - Selects Premier Padel ORGANIZATION_CONTEXT question
 * - Runs bounded discovery via DuckDuckGo (OpenClaw tool not available; uses HTML endpoint)
 * - Fetches ONE selected page (bounded)
 * - Produces preview only: NO EvidenceReference writes, NO Claim writes
 */

import crypto from "node:crypto";

import { execFileSync } from "node:child_process";
import type { EntityRef } from "@/lib/external-intelligence/contracts/entity-ref";
import { ExternalEventV1Schema, type ExternalEventV1 } from "@/lib/external-intelligence/contracts/external-event-v1";
import type { EventVersionRefV1 } from "@/lib/external-intelligence/contracts/external-event-v1";
import { detectOpportunityCandidatesFromEventV1 } from "@/lib/external-intelligence/opportunities/opportunity-candidate-policy-v1";
import { planOpportunityContextQuestionsV1 } from "@/lib/external-intelligence/opportunities/context-research-questions-v1";
import type { ResearchQuestionV1 } from "@/lib/external-intelligence/opportunities/context-research-questions-v1";
import { executeTargetedExternalResearchPreviewV1 } from "@/lib/external-intelligence/targeted-research/targeted-external-research-executor-v1";
import type { ResearchDiscoveryProviderV1 } from "@/lib/external-intelligence/targeted-research/discovery-provider-v1";
import type { DiscoveryResultV1 } from "@/lib/external-intelligence/targeted-research/targeted-research-contracts-v1";

function sha256Hex(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

function parseDuckDuckGoHtmlResults(html: string): DiscoveryResultV1[] {
  // Very small, brittle parser: extracts hrefs from result links.
  // This script is local-only proof; not used in production lanes.
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

function loadInjectedDiscoveryResults(): Record<string, DiscoveryResultV1[]> | null {
  const raw = process.env.DISCOVERY_RESULTS_JSON;
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Record<string, DiscoveryResultV1[]>;
  } catch {
    return null;
  }
}

const DuckDuckGoDiscoveryProvider: ResearchDiscoveryProviderV1 = {
  kind: "duckduckgo_html_v1",
  search: async (input) => {
    const injected = loadInjectedDiscoveryResults();
    if (injected && injected[input.query]) {
      return (injected[input.query] ?? []).slice(0, input.max_results);
    }

    const q = encodeURIComponent(input.query);
    const url = `https://duckduckgo.com/html/?q=${q}`;
    const res = await fetch(url, { headers: { "user-agent": "keegan-dashboard-targeted-research/1.0" } });
    if (!res.ok) {
      // Important: a failed search request (403/429/5xx) is NOT the same as a successful search with zero results.
      // Do not include response body.
      throw new Error(`search_request_failed:provider=duckduckgo_html_v1 http_status=${res.status}`);
    }
    const html = await res.text();
    return parseDuckDuckGoHtmlResults(html).slice(0, input.max_results);
  }
};

const SUPABASE = "/opt/homebrew/bin/supabase";

function query(sql: string): Array<Record<string, unknown>> {
  const out = execFileSync(SUPABASE, ["db", "query", "--linked", "--output", "json", sql], {
    stdio: ["ignore", "pipe", "pipe"],
    encoding: "utf8"
  });
  return JSON.parse(out) as Array<Record<string, unknown>>;
}

async function loadProductionEvents() {
  const rows = query(
    "select e.event_id, e.current_content_hash, v.payload_json, v.policy_version from public.external_events_v1 e join public.external_event_versions_v1 v on v.event_id = e.event_id and v.content_hash = e.current_content_hash order by e.event_type, e.event_id;"
  );

  const versions: ExternalEventV1[] = [];
  for (const r of rows) {
    const payload = r.payload_json as unknown;
    const p = payload as Record<string, unknown>;
    const times = (p["times"] as unknown as Record<string, unknown> | null) ?? {};
    const normalized = {
      ...p,
      times: {
        announcement_time: (times["announcement_time"] as unknown) ?? null,
        event_time: (times["event_time"] as unknown) ?? null,
        retrieved_at: (times["retrieved_at"] as unknown) ?? null,
        effective_from: (times["effective_from"] as unknown) ?? null,
        effective_until: (times["effective_until"] as unknown) ?? null
      }
    };
    versions.push(ExternalEventV1Schema.parse(normalized) as ExternalEventV1);
  }
  return versions;
}

function pickPremierPadelOrgContextQuestion(
  plans: Array<{ candidate_id: string; question: ResearchQuestionV1; subject: ExternalEventV1["participants"][number]["entity_ref"] }>
) {
  const q = plans.find((p) => p.question.question_type === "ORGANIZATION_CONTEXT" && p.question.question_text.includes("Premier Padel"));
  if (!q) throw new Error("premier_padel_org_context_question_not_found");
  return q;
}

async function main() {
  const now = new Date().toISOString();

  const events = await loadProductionEvents();

  const plans: Array<{ candidate_id: string; question: ResearchQuestionV1; subject: ExternalEventV1["participants"][number]["entity_ref"] }> = [];

  for (const ev of events) {
    const event_version_ref: Pick<EventVersionRefV1, "event_id" | "content_hash" | "schema_version" | "policy_version"> = {
      event_id: ev.event_id,
      content_hash: sha256Hex(JSON.stringify(ev)).slice(0, 64).padEnd(64, "0"),
      schema_version: "external_event_v1",
      policy_version: ev.policy_version
    };

    const det = detectOpportunityCandidatesFromEventV1({ event: ev, event_version_ref, includeRejections: false });
    for (const c of det.candidates) {
      const res = planOpportunityContextQuestionsV1(c);
      if (res.status !== "planned") continue;
      const q = res.plan.questions.find((qq) => qq.question_type === "ORGANIZATION_CONTEXT") ?? null;
      if (!q) continue;
      plans.push({ candidate_id: c.opportunity_candidate_id, question: q, subject: c.context_entity_refs[0] });
    }
  }

  const picked = pickPremierPadelOrgContextQuestion(plans);

  const subject = picked.subject as unknown as EntityRef;

  const preview = await executeTargetedExternalResearchPreviewV1({
    research_question: picked.question,
    candidate_id: picked.candidate_id,
    subject,
    now_iso: now,
    deps: {
      discovery: DuckDuckGoDiscoveryProvider,
      evidenceReuseLookup: async (x) => {
        const rows = query(
          `select evidence_reference_id from public.external_evidence_reference_versions_v1 where source_id='${x.source_id.replace(/'/g, "''")}' and payload_json->>'source_url_or_reference'='${x.canonical_url.replace(/'/g, "''")}' limit 1;`
        );
        const row = rows[0] as undefined | { evidence_reference_id?: string };
        return { exists: !!row?.evidence_reference_id };
      }
    },
    bounds: {
      max_queries: 3,
      max_results_per_query: 5,
      max_unique_urls: 10,
      max_selected_sources: 1,
      fetch_timeout_ms: 8000,
      fetch_max_bytes: 900_000
    }
  });

  process.stdout.write(JSON.stringify({ now, picked: { candidate_id: picked.candidate_id, research_question_id: picked.question.research_question_id, subject }, preview }, null, 2));
}

main().catch((e) => {
  // Local script failure output.
  console.error(e);
  process.exit(1);
});
