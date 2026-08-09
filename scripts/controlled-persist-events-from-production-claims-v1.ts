#!/usr/bin/env tsx
/**
 * Controlled production proof:
 * - Reads the production Claim versions
 * - Builds Event candidates in-memory
 * - Persists Events via persist_external_event_v1 RPC (called through Supabase CLI)
 *
 * Safety:
 * - Aborts if event tables are non-empty
 * - Aborts if candidate count is not exactly 3
 * - Does not recollect evidence / create claims
 */

import { execFileSync } from "node:child_process";

import { buildEventCandidatesFromClaimV1 } from "@/lib/external-intelligence/events/build-event-candidates-v1";
import { ClaimSchema } from "@/lib/external-intelligence/contracts/claim";
import type { Claim } from "@/lib/external-intelligence/contracts/claim";
import type { ExternalEventV1 } from "@/lib/external-intelligence/contracts/external-event-v1";
import {
  computeEventFingerprintV1,
  computeEventContentHashV1,
  projectEventForFingerprintV1
} from "@/lib/external-intelligence/events/event-fingerprint-v1";

const SUPABASE = "/opt/homebrew/bin/supabase";

function query(sql: string): Array<Record<string, unknown>> {
  const out = execFileSync(SUPABASE, ["db", "query", "--linked", "--output", "json", sql], {
    stdio: ["ignore", "pipe", "pipe"],
    encoding: "utf8"
  });
  return JSON.parse(out) as Array<Record<string, unknown>>;
}

const counts = query(
  "select (select count(*)::int from public.external_events_v1) as events, (select count(*)::int from public.external_event_versions_v1) as versions, (select count(*)::int from public.external_event_claim_links_v1) as links;"
)[0] as { events: number; versions: number; links: number };

if (!counts || counts.events !== 0 || counts.versions !== 0 || counts.links !== 0) {
  throw new Error(`precondition_failed:event_tables_not_empty:${JSON.stringify(counts)}`);
}

const rows = query(
  "select claim_id, content_hash, schema_version, payload_json from public.external_claim_versions_v1 order by created_at asc;"
) as Array<{ claim_id: string; content_hash: string; schema_version: string; payload_json: unknown }>;

const candidates: Array<{ ev: ExternalEventV1; supporting_claim: { claim_id: string; claim_content_hash: string } }> = [];
for (const r of rows) {
  const claim = ClaimSchema.parse(r.payload_json) as Claim;
  const events = buildEventCandidatesFromClaimV1({ claim });
  for (const ev of events) {
    candidates.push({ ev, supporting_claim: { claim_id: r.claim_id, claim_content_hash: r.content_hash } });
  }
}

if (candidates.length !== 3) {
  throw new Error(`precondition_failed:expected_3_event_candidates:got_${candidates.length}`);
}

const results: Array<Record<string, unknown>> = [];
for (const c of candidates) {
  const ev = c.ev;
  const event_fingerprint = computeEventFingerprintV1(ev);
  const content_hash = computeEventContentHashV1(ev);
  const payload = projectEventForFingerprintV1(ev);

  // Deterministic link id derived from event+claim identity.
  const link_id = `evcl:${content_hash.slice(0, 12)}:${c.supporting_claim.claim_content_hash.slice(0, 12)}`;

  const payloadJson = JSON.stringify(payload);
  const sql = `select * from public.persist_external_event_v1(
    '${ev.event_id}',
    '${content_hash}',
    '${ev.schema_version}',
    '${event_fingerprint}',
    '${ev.policy_version}',
    '${ev.event_type}',
    $$${payloadJson}$$::jsonb,
    true,
    ${ev.times.announcement_time ? `'${ev.times.announcement_time}'::timestamptz` : "null"},
    ${ev.times.event_time ? `'${ev.times.event_time}'::timestamptz` : "null"},
    ${ev.times.effective_from ? `'${ev.times.effective_from}'::timestamptz` : "null"},
    ${ev.times.effective_until ? `'${ev.times.effective_until}'::timestamptz` : "null"},
    '${ev.verification_state}',
    'active',
    'none',
    '${c.supporting_claim.claim_id}',
    '${c.supporting_claim.claim_content_hash}',
    '${link_id}'
  );`;

  const out = query(sql);
  results.push({
    event_id: ev.event_id,
    content_hash,
    supporting_claim: c.supporting_claim,
    rpc_result: out?.[0] ?? null
  });
}

const finalCounts = query(
  "select (select count(*)::int from public.external_events_v1) as events, (select count(*)::int from public.external_event_versions_v1) as versions, (select count(*)::int from public.external_event_claim_links_v1) as links;"
)[0];

process.stdout.write(JSON.stringify({ generated_at: new Date().toISOString(), results, finalCounts }, null, 2));
