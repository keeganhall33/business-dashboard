import { z } from "zod";

import { assertSchedulerAuth } from "@/lib/scheduler/auth";
import { getExternalIntelligenceSupabaseClient } from "@/lib/external-intelligence/persistence/supabase/client";
import { EvidenceReferenceRepository } from "@/lib/external-intelligence/persistence/supabase/evidence-reference.repository";
import { ClaimRepository } from "@/lib/external-intelligence/persistence/supabase/claim.repository";
import { qualifyEvidenceReferenceDownstreamV1 } from "@/lib/external-intelligence/qualification/downstream-qualification-v1";

export const runtime = "nodejs";

const BodySchema = z
  .object({
    source_id: z.literal("sports_business.sportspro"),
    evidence_reference_ids: z.array(z.string().min(1)).length(2),
    dry_run: z.boolean().optional().default(false),
    requested_by: z.string().min(1)
  })
  .strict();

export async function POST(request: Request) {
  await assertSchedulerAuth(request);

  const body = BodySchema.parse(await request.json());

  const supabase = getExternalIntelligenceSupabaseClient({});
  const evidenceRepo = new EvidenceReferenceRepository();
  const claimRepo = new ClaimRepository();

  // Safety: ensure all external schedules remain disabled before doing any write.
  const { count: enabledCount, error: enabledErr } = await supabase
    .from("external_collection_schedules_v1")
    .select("schedule_id", { count: "exact", head: true })
    .eq("enabled", true)
    .eq("environment", "production");
  if (enabledErr) throw enabledErr;
  if ((enabledCount ?? 0) !== 0) {
    return Response.json({ ok: false, error: "enabled_schedules_not_zero", enabledCount }, { status: 409 });
  }

  const results: Array<{
    evidence_reference_id: string;
    qualification_status: string;
    reason_codes: string[];
    proposed_claims: Array<{ claim_id: string; predicate: string; schema_version: string }>;
    persisted_claims: Array<{ claim_id: string; created_new_version: boolean; idempotent_replay: boolean }>;
  }> = [];

  for (const evidence_reference_id of body.evidence_reference_ids) {
    const stable = await evidenceRepo.getStable(evidence_reference_id, { client: supabase });
    const version = await evidenceRepo.getVersion(
      {
        object_type: "evidence_reference",
        object_id: stable.evidence_reference_id,
        version_id: null,
        content_hash: stable.current_content_hash,
        schema_version: "evidence_reference_v1",
        policy_version: stable.legal_policy_version,
        created_at: new Date().toISOString()
      },
      { client: supabase }
    );

    if (!version.payload_available) {
      return Response.json({ ok: false, error: "evidence_payload_not_available", evidence_reference_id }, { status: 409 });
    }

    const ev = version.payload_json;
    if (!ev) {
      return Response.json({ ok: false, error: "evidence_payload_missing", evidence_reference_id }, { status: 409 });
    }
    if (ev.source_id !== body.source_id) {
      return Response.json(
        { ok: false, error: "source_id_mismatch", evidence_reference_id, source_id: ev.source_id },
        { status: 409 }
      );
    }

    const q = qualifyEvidenceReferenceDownstreamV1({
      evidence: ev,
      now_iso: new Date().toISOString(),
      source_context: { kind: "sportspro" }
    });

    const proposed = q.claims.map((c) => ({ claim_id: c.claim_id, predicate: c.predicate, schema_version: c.schema_version }));
    const persisted: Array<{ claim_id: string; created_new_version: boolean; idempotent_replay: boolean }> = [];

    if (!body.dry_run && q.status === "qualified") {
      for (const claim of q.claims) {
        const res = await claimRepo.persistClaim({
          claim,
          evidence_version_ref: {
            object_type: "evidence_reference",
            object_id: stable.evidence_reference_id,
            version_id: null,
            content_hash: stable.current_content_hash,
            schema_version: "evidence_reference_v1",
            policy_version: stable.legal_policy_version,
            created_at: new Date().toISOString()
          },
          policy_refs_json: [],
          interpretation_policy_hash: "ph",
          edge: { relation: "supported_by", policy_version: "provenance/v1", policy_hash: "ph" },
          opts: { client: supabase }
        });
        persisted.push({
          claim_id: res.ref.object_id,
          created_new_version: res.created_new_version,
          idempotent_replay: res.idempotent_replay
        });
      }
    }

    results.push({
      evidence_reference_id,
      qualification_status: q.status,
      reason_codes: q.reason_codes,
      proposed_claims: proposed,
      persisted_claims: persisted
    });
  }

  return Response.json({
    ok: true,
    requested_by: body.requested_by,
    dry_run: body.dry_run,
    wrote: !body.dry_run,
    results
  });
}
