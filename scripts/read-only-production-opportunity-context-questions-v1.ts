#!/usr/bin/env tsx
/**
 * Read-only production Opportunity Context Questions V1 proof.
 *
 * - Reads current production Event versions from linked Supabase.
 * - Regenerates OpportunityCandidates deterministically.
 * - Generates deterministic ResearchPlans.
 * - Performs NO writes.
 * - Performs NO web fetches.
 */

import { execFileSync } from "node:child_process";

import { ExternalEventV1Schema, type ExternalEventV1 } from "@/lib/external-intelligence/contracts/external-event-v1";
import type { EventVersionRefV1 } from "@/lib/external-intelligence/contracts/external-event-v1";
import { detectOpportunityCandidatesFromEventV1 } from "@/lib/external-intelligence/opportunities/opportunity-candidate-policy-v1";
import { planOpportunityContextQuestionsV1 } from "@/lib/external-intelligence/opportunities/context-research-questions-v1";

const SUPABASE = "/opt/homebrew/bin/supabase";

function query(sql: string): Array<Record<string, unknown>> {
  const out = execFileSync(SUPABASE, ["db", "query", "--linked", "--output", "json", sql], {
    stdio: ["ignore", "pipe", "pipe"],
    encoding: "utf8"
  });
  return JSON.parse(out) as Array<Record<string, unknown>>;
}

const rows = query(
  "select e.event_id, e.event_type, e.lifecycle_status, e.current_content_hash, v.content_hash, v.schema_version, v.policy_version, v.payload_json from public.external_events_v1 e join public.external_event_versions_v1 v on v.event_id = e.event_id and v.content_hash = e.current_content_hash order by e.event_type, e.event_id;"
);

const eventsOut: Array<Record<string, unknown>> = [];
const plansOut: Array<Record<string, unknown>> = [];
let candidateCount = 0;

for (const r of rows) {
  const payload = r.payload_json as unknown;
  // Stored event payload excludes retrieved_at by design (fingerprint projection). Normalize for schema.
  const p = payload as unknown as Record<string, unknown>;
  const times = (p["times"] as unknown as Record<string, unknown> | undefined) ?? {};
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

  const ev = ExternalEventV1Schema.parse(normalized) as ExternalEventV1;

  const event_version_ref: Pick<EventVersionRefV1, "event_id" | "content_hash" | "schema_version" | "policy_version"> = {
    event_id: String(r.event_id),
    content_hash: String(r.content_hash),
    schema_version: "external_event_v1",
    policy_version: String(r.policy_version)
  };

  const det = detectOpportunityCandidatesFromEventV1({ event: ev, event_version_ref, includeRejections: true });

  eventsOut.push({
    event_id: ev.event_id,
    event_type: ev.event_type,
    audit: det.audit,
    candidate_count: det.candidates.length
  });

  for (const c of det.candidates) {
    candidateCount += 1;
    const res = planOpportunityContextQuestionsV1(c);
    if (res.status === "unsupported") {
      plansOut.push({
        opportunity_candidate_id: c.opportunity_candidate_id,
        opportunity_type: c.opportunity_type,
        status: res.status,
        reason: res.reason,
        supported_opportunity_types: res.supported_opportunity_types
      });
      continue;
    }

    const plan = res.plan;

    plansOut.push({
      opportunity_candidate_id: c.opportunity_candidate_id,
      opportunity_type: c.opportunity_type,
      focal: c.focal_entity_refs.map((e) => ({ entity_id: e.entity_id, canonical_name: e.canonical_name })),
      context: c.context_entity_refs.map((e) => ({ entity_id: e.entity_id, canonical_name: e.canonical_name })),
      relevant_functions: c.relevant_functions,
      detector_classification: c.detector_classification,

      planner_policy_version: plan.planner_policy_version,
      question_count: plan.questions.length,
      max_questions: plan.max_questions,
      max_dependency_depth: plan.max_dependency_depth,
      root_question_ids: plan.root_question_ids,

      questions: plan.questions.map((q) => ({
        research_question_id: q.research_question_id,
        question_type: q.question_type,
        priority: q.priority,
        source_domain: q.source_domain,
        acceptable_source_classes: q.acceptable_source_classes,
        freshness: q.freshness,
        source_missing_intelligence_category: q.source_missing_intelligence_category,
        subject_entity_refs: q.subject_entity_refs.map((e) => ({ entity_id: e.entity_id, canonical_name: e.canonical_name })),
        dependencies: q.dependencies,
        stop_conditions: q.stop_conditions,
        question_text: q.question_text
      }))
    });
  }
}

const summary = {
  processed_events: eventsOut.length,
  regenerated_candidates: candidateCount,
  generated_plans: plansOut.filter((p) => (p.status as unknown) !== "unsupported").length,
  total_questions: plansOut.reduce((n, p) => n + Number(p.question_count ?? 0), 0),
  external_fetches: 0,
  production_writes: 0
};

process.stdout.write(JSON.stringify({ generated_at: new Date().toISOString(), summary, events: eventsOut, plans: plansOut }, null, 2));
