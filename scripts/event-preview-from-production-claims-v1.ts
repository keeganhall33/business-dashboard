#!/usr/bin/env tsx
/**
 * Read-only preview: build Event candidates from current production Claim versions.
 *
 * - Uses Supabase CLI linked session.
 * - Does not write.
 */

import { execFileSync } from "node:child_process";

import { buildEventCandidatesFromClaimV1 } from "@/lib/external-intelligence/events/build-event-candidates-v1";
import { ClaimSchema } from "@/lib/external-intelligence/contracts/claim";
import type { Claim } from "@/lib/external-intelligence/contracts/claim";
import { computeEventFingerprintV1, computeEventContentHashV1 } from "@/lib/external-intelligence/events/event-fingerprint-v1";

const SUPABASE = "/opt/homebrew/bin/supabase";

function query(sql: string): Array<Record<string, unknown>> {
  const out = execFileSync(SUPABASE, ["db", "query", "--linked", "--output", "json", sql], {
    stdio: ["ignore", "pipe", "pipe"],
    encoding: "utf8"
  });
  return JSON.parse(out) as Array<Record<string, unknown>>;
}

const rows = query(
  "select claim_id, content_hash, schema_version, payload_json from public.external_claim_versions_v1 order by created_at asc;"
);

const preview: Array<Record<string, unknown>> = [];

for (const r of rows) {
  const claim = ClaimSchema.parse(r.payload_json) as Claim;
  const events = buildEventCandidatesFromClaimV1({ claim });
  for (const ev of events) {
    const ref = (p: unknown): { entity_id: string | null; canonical_name: string | null } => {
      const o = p as { entity_id?: unknown; canonical_name?: unknown };
      return {
        entity_id: typeof o?.entity_id === "string" ? o.entity_id : null,
        canonical_name: typeof o?.canonical_name === "string" ? o.canonical_name : null
      };
    };

    preview.push({
      event_id: ev.event_id,
      event_type: ev.event_type,
      participants: ev.participants.map((p) => ({
        role: p.role,
        ...ref(p.entity_ref)
      })),
      attributes: ev.attributes,
      times: ev.times,
      event_fingerprint: computeEventFingerprintV1(ev),
      content_hash: computeEventContentHashV1(ev),
      supporting_claim: {
        claim_id: r.claim_id,
        content_hash: r.content_hash,
        schema_version: r.schema_version
      }
    });
  }
}

preview.sort((a, b) => String(a.event_id).localeCompare(String(b.event_id)));

process.stdout.write(JSON.stringify({ generated_at: new Date().toISOString(), count: preview.length, events: preview }, null, 2));
