import "@/lib/server-only";

import type { EvidenceReference } from "@/lib/external-intelligence/contracts/evidence-reference";
import type { Claim } from "@/lib/external-intelligence/contracts/claim";
import type { SportsMilestone } from "@/lib/external-intelligence/milestones/contracts";

import { HOOPHALL_SOURCE_ID } from "@/lib/external-intelligence/collection/hoophall/hoophall.contract";
import { BOARDROOM_SOURCE_ID } from "@/lib/external-intelligence/collection/boardroom/boardroom.contract";
import { SPORTSPRO_SOURCE_ID } from "@/lib/external-intelligence/collection/sportspro/sportspro.contract";
import {
  type HoophallMilestoneCategory,
  qualifyHoophallItemToMilestone,
  buildHoophallClaim,
  buildHoophallMilestone
} from "@/lib/external-intelligence/collection/hoophall/hoophall.qualification";

import { qualifyGeneralizedClaimsV1 } from "@/lib/external-intelligence/qualification/generalized-claim-qualifier-v1";

export type DownstreamQualificationStatus = "qualified" | "not_qualified" | "unsupported" | "error";

export type DownstreamQualificationResultV1 = {
  status: DownstreamQualificationStatus;
  reason_codes: string[];
  claims: Claim[];
  sports_milestones: SportsMilestone[];
};

type HoophallSourceContext = {
  kind: "hoophall";
  headline: string;
  listing_description: string | null;
  detail_excerpt: string | null;
};

type BoardroomSourceContext = {
  kind: "boardroom";
};

type SportsProSourceContext = {
  kind: "sportspro";
};

export type SourceContextV1 = HoophallSourceContext | BoardroomSourceContext | SportsProSourceContext;

function okEmpty(input: { status: DownstreamQualificationStatus; reason_codes: string[] }): DownstreamQualificationResultV1 {
  return Object.freeze({ status: input.status, reason_codes: input.reason_codes.slice(), claims: [], sports_milestones: [] });
}

function safeErrorCode(error: unknown): string {
  if (error instanceof Error) return `error:${error.message.slice(0, 120)}`;
  return `error:${String(error).slice(0, 120)}`;
}

/**
 * Generic downstream qualification stage (v1).
 *
 * Contract:
 * - accepts a persisted EvidenceReference (source-independent)
 * - may accept a narrow source_context for parity where semantics depend on
 *   source adapter outputs (e.g. Hoophall snippet + detail excerpt)
 * - produces structured objects (Claim, SportsMilestone) without writing
 * - deterministic + bounded
 */
export function qualifyEvidenceReferenceDownstreamV1(input: {
  evidence: EvidenceReference;
  now_iso: string;
  source_context: SourceContextV1;
}): DownstreamQualificationResultV1 {
  try {
    const ev = input.evidence;

    if (input.source_context.kind === "boardroom" || input.source_context.kind === "sportspro") {
      // Boardroom + SportsPro: generalized deterministic claims (V1) based only on persisted title+excerpt.
      // Predicate set remains unchanged; source controls only the evidence ingest.
      const expectedSourceId = input.source_context.kind === "boardroom" ? BOARDROOM_SOURCE_ID : SPORTSPRO_SOURCE_ID;
      if (ev.source_id !== expectedSourceId) {
        return okEmpty({ status: "unsupported", reason_codes: ["source_id_mismatch"] });
      }

      const pm = ev.provenance_metadata as Record<string, unknown>;
      const title = typeof pm.title === "string" ? pm.title : null;
      const excerpt = typeof pm.excerpt === "string" ? pm.excerpt : null;

      const q = qualifyGeneralizedClaimsV1({
        evidence_reference_id: ev.evidence_reference_id,
        source_id: ev.source_id,
        title,
        excerpt,
        // IMPORTANT: Claims are derived from persisted evidence text.
        // We intentionally pin claim.retrieved_at to the evidence retrieval timestamp
        // (not the current qualification runtime) so recollection can replay idempotently
        // without attempting to create a new claim version for each run.
        retrieved_at_iso: ev.retrieved_at
      });

      if (q.status === "qualified") {
        return Object.freeze({ status: "qualified", reason_codes: [], claims: q.claims, sports_milestones: [] });
      }

      if (q.status === "error") {
        return okEmpty({ status: "error", reason_codes: q.reason_codes.length ? q.reason_codes : ["generalized_claim_error"] });
      }

      // not_qualified is a normal successful outcome.
      return okEmpty({ status: "not_qualified", reason_codes: q.reason_codes.length ? q.reason_codes : ["not_qualified"] });
    }

    // Hoophall parity path.
    if (input.source_context.kind === "hoophall") {
      if (ev.source_id !== HOOPHALL_SOURCE_ID) {
        return okEmpty({ status: "unsupported", reason_codes: ["source_id_mismatch"] });
      }

      const qual = qualifyHoophallItemToMilestone({
        headline: input.source_context.headline,
        listing_description: input.source_context.listing_description,
        detail_excerpt: input.source_context.detail_excerpt
      });

      if (!qual.ok) {
        return okEmpty({ status: "not_qualified", reason_codes: [qual.reason] });
      }

      const object_date_ymd = qual.milestone_date_ymd;
      const category = qual.category as HoophallMilestoneCategory;

      const claim = buildHoophallClaim({
        evidence_reference_id: ev.evidence_reference_id,
        predicate: "milestone_scheduled_for",
        subject: null,
        object_date_ymd,
        // Pin to evidence retrieval time for idempotent replay on recollection.
        retrieved_at_iso: ev.retrieved_at,
        announcement_time_iso: null
      });

      const milestone = buildHoophallMilestone({
        category,
        milestone_date_ymd: object_date_ymd,
        evidence_url: ev.source_url_or_reference,
        evidence_label: input.source_context.headline
      });

      return Object.freeze({
        status: "qualified",
        reason_codes: [],
        claims: [claim],
        sports_milestones: [milestone]
      });
    }

    // Exhaustiveness.
    return okEmpty({ status: "unsupported", reason_codes: ["unsupported_source_context"] });
  } catch (error) {
    return okEmpty({ status: "error", reason_codes: [safeErrorCode(error)] });
  }
}
