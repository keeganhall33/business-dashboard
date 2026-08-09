#!/usr/bin/env tsx
/**
 * Read-only production OpportunityCandidate V1 detector proof.
 *
 * - Reads current production Event versions from linked Supabase.
 * - Performs NO writes.
 * - Runs deterministic detector.
 */

import { execFileSync } from "node:child_process";

import { ExternalEventV1Schema, type ExternalEventV1 } from "@/lib/external-intelligence/contracts/external-event-v1";
import type { EventVersionRefV1 } from "@/lib/external-intelligence/contracts/external-event-v1";
import {
  detectOpportunityCandidatesFromEventV1
} from "@/lib/external-intelligence/opportunities/opportunity-candidate-policy-v1";

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

const out: Array<Record<string, unknown>> = [];

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

  out.push({
    event_id: ev.event_id,
    event_type: ev.event_type,
    candidate_count: det.candidates.length,
    audit: det.audit,
    candidates: det.candidates.map((c) => ({
      opportunity_candidate_id: c.opportunity_candidate_id,
      opportunity_type: c.opportunity_type,
      detector_classification: c.detector_classification,
      focal: c.focal_entity_refs.map((e) => ({ entity_id: e.entity_id, canonical_name: e.canonical_name })),
      context: c.context_entity_refs.map((e) => ({ entity_id: e.entity_id, canonical_name: e.canonical_name })),
      relevant_functions: c.relevant_functions,
      hypothesis: c.hypothesis,
      reason_codes: c.reason_codes,
      derived_signals: c.derived_signals,
      assumptions: c.assumptions,
      missing_intelligence: c.missing_intelligence,
      trigger_event_version_refs: c.trigger_event_version_refs,
      detector_policy_version: c.detector_policy_version
    }))
  });
}

const summary = {
  processed_events: out.length,
  emitted_candidates: out.reduce((n, x) => n + Number(x.candidate_count ?? 0), 0),
  clear: out.reduce((n, x) => {
    const cs = (x.candidates as unknown) as Array<{ detector_classification?: unknown }>;
    if (!Array.isArray(cs)) return n;
    return n + cs.filter((c) => c.detector_classification === "CLEAR").length;
  }, 0),
  plausible_needs_context: out.reduce((n, x) => {
    const cs = (x.candidates as unknown) as Array<{ detector_classification?: unknown }>;
    if (!Array.isArray(cs)) return n;
    return n + cs.filter((c) => c.detector_classification === "PLAUSIBLE_NEEDS_CONTEXT").length;
  }, 0)
};

process.stdout.write(JSON.stringify({ generated_at: new Date().toISOString(), summary, events: out }, null, 2));
