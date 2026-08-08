#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-explicit-any */
// Read-only production dry-run for Generalized Claim V1 (Boardroom only).
//
// Safety contract:
// - Reads existing EvidenceReferences + current version payloads.
// - Runs the generalized qualifier in-memory.
// - Performs ZERO writes (no claim persistence, no schedule mutation, no enqueue).
//
// Run (production):
// OPERATOR_ENVIRONMENT=production op run --env-file .env.woo.ci -- pnpm tsx scripts/dry-run-generalized-claims-boardroom-v1.ts --ids <...>

import { createClient } from "@supabase/supabase-js";
import assert from "node:assert";

import { qualifyGeneralizedClaimsV1 } from "@/lib/external-intelligence/qualification/generalized-claim-qualifier-v1";

function parseIds(argv: string[]): string[] | null {
  const idx = argv.indexOf("--ids");
  if (idx === -1) return null;
  const raw = argv[idx + 1];
  if (!raw) return null;
  const ids = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return ids.length ? ids : null;
}

function redactedHost(url: string) {
  try {
    const u = new URL(url);
    return u.host;
  } catch {
    return "<unknown>";
  }
}

async function main() {
  // Require explicit production intent.
  assert(process.env.OPERATOR_ENVIRONMENT === "production", "precondition_failed:OPERATOR_ENVIRONMENT must be 'production'");

  const ids = parseIds(process.argv.slice(2));
  assert(ids && ids.length > 0, "missing_argument: --ids <comma-separated evidence_reference_id list>");
  assert(ids.length <= 10, "precondition_failed: ids cap exceeded (max 10)");

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  assert(url && key, "missing_supabase_env");

  // Require expected production project ref in the host (guard against wrong target).
  assert(
    url.includes("ibjsjosplgbqevmnvvpf.supabase.co"),
    "precondition_failed:unexpected_supabase_project_ref (expected ibjsjosplgbqevmnvvpf)"
  );

  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  // Read stable rows.
  const { data: stable, error: e1 } = await supabase
    .from("external_evidence_references_v1")
    .select("evidence_reference_id,current_content_hash,source_id")
    .in("evidence_reference_id", ids);
  if (e1) throw e1;

  // Read versions for those stable rows.
  const { data: vers, error: e2 } = await supabase
    .from("external_evidence_reference_versions_v1")
    .select("evidence_reference_id,content_hash,payload_available,payload_json")
    .in(
      "evidence_reference_id",
      (stable ?? []).map((s) => s.evidence_reference_id)
    );
  if (e2) throw e2;

  const vByKey = new Map<string, any>();
  for (const v of vers ?? []) vByKey.set(`${v.evidence_reference_id}|${v.content_hash}`, v);

  const out: any[] = [];

  for (const s of stable ?? []) {
    const v = vByKey.get(`${s.evidence_reference_id}|${s.current_content_hash}`) ?? null;
    const payload = v?.payload_available ? v?.payload_json : null;
    const pm = payload?.provenance_metadata ?? null;

    const title = pm?.title ?? pm?.headline ?? null;
    const excerpt = pm?.excerpt ?? null;

    const q = qualifyGeneralizedClaimsV1({
      evidence_reference_id: s.evidence_reference_id,
      source_id: s.source_id,
      title,
      excerpt,
      retrieved_at_iso: new Date().toISOString()
    });

    out.push({
      evidence_reference_id: s.evidence_reference_id,
      source_id: s.source_id,
      title,
      status: q.status,
      reason_codes: q.reason_codes,
      claim_count: q.claims.length,
      claims: q.claims.map((c) => ({
        subject: { canonical_name: c.subject?.canonical_name ?? null, entity_id: c.subject?.entity_id ?? null },
        predicate: c.predicate,
        object:
          c.object.kind === "entity"
            ? { canonical_name: c.object.entity.canonical_name, entity_id: c.object.entity.entity_id }
            : { kind: "literal" },
        confidence: c.extraction_confidence,
        claim_id: c.claim_id,
        claim_fingerprint: c.claim_fingerprint,
        supporting_phrase: c.supporting_phrase
      }))
    });
  }

  // Safe output only (no secrets). Print host to confirm target without exposing URL.
  console.log(
    JSON.stringify(
      {
        mode: "dry_run",
        supabase_host: redactedHost(url),
        evidence_count: out.length,
        results: out
      },
      null,
      2
    )
  );
}

main().catch((e) => {
  console.error("dry-run failed", { error: e?.message ?? String(e) });
  process.exitCode = 1;
});
