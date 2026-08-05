import "@/lib/server-only";

import type { SportsMilestone } from "@/lib/external-intelligence/milestones/contracts";
import { parseSportsMilestone } from "@/lib/external-intelligence/milestones/contracts";
import { chooseProjectClass } from "@/lib/external-intelligence/milestones/horizon-engine";
import {
  PersistenceIdempotencyConflictError,
  PersistenceNotFoundError
} from "@/lib/external-intelligence/persistence/errors";
import { getExternalIntelligenceSupabaseClient } from "@/lib/external-intelligence/persistence/supabase/client";
import { EXTERNAL_INTELLIGENCE_RPCS, runRpc } from "@/lib/external-intelligence/persistence/supabase/transactions";

export type MilestonePolicyRef = {
  policy_name: string;
  semantic_version: string;
  content_hash: string;
};

export type PersistSportsMilestoneResult = {
  milestone_id: string;
  content_hash: string;
  created_new_version: boolean;
  idempotent_replay: boolean;
};

type SportsMilestonesRow = {
  milestone_id: string;
  current_content_hash: string;
};

type SportsMilestoneVersionRow = {
  milestone_id: string;
  content_hash: string;
  canonical_payload_json: unknown;
  created_at: string;
};

export class SportsMilestoneRepository {
  async persistMilestone(input: {
    milestone: SportsMilestone;
    policy_refs: MilestonePolicyRef[];
  }): Promise<PersistSportsMilestoneResult> {
    const supabase = getExternalIntelligenceSupabaseClient({});
    const m = parseSportsMilestone(input.milestone);

    if (!input.policy_refs || input.policy_refs.length === 0) {
      throw new Error("invalid_argument");
    }

    const primary = m.subject_entities[0];
    if (!primary) throw new Error("invalid_argument");

    // Evidence/source refs are part of the milestone payload itself; DB expects non-empty arrays.
    const evidence_refs_json = m.evidence_refs.map((e) => ({ label: e.label, url: e.url, note: e.note }));
    const source_ids_json = m.source_ids.slice();

    const policy_refs_json = input.policy_refs.map((p) => ({
      policy_name: p.policy_name,
      semantic_version: p.semantic_version,
      content_hash: p.content_hash
    }));

    const project_class = chooseProjectClass(m);

    const res = await runRpc<PersistSportsMilestoneResult[]>({
      client: supabase,
      fn: EXTERNAL_INTELLIGENCE_RPCS.persistSportsMilestone,
      args: {
        in_milestone_id: m.milestone_id,
        in_content_hash: m.content_hash,
        in_schema_version: m.schema_version,
        in_canonical_payload_json: m,
        in_policy_refs_json: policy_refs_json,
        in_evidence_refs_json: evidence_refs_json,
        in_source_ids_json: source_ids_json,
        in_milestone_type: m.milestone_type,
        in_primary_subject_id: primary.entity_id,
        in_team_id: m.team ?? null,
        in_league_id: m.league,
        in_original_event_date: m.original_event_date,
        in_milestone_date: m.milestone_date,
        in_anniversary_number: m.anniversary_number,
        in_project_class: project_class,
        in_historical_significance: m.historical_significance,
        in_partnership_potential: m.partnership_potential,
        in_licensing_considerations_json: m.licensing_rights_considerations,
        in_correction_status: m.correction_status
      }
    });

    const row = res[0];
    if (!row) throw new Error("unknown_db_error");
    return row;
  }

  async fetchCurrent(milestone_id: string): Promise<{ milestone_id: string; current_content_hash: string }> {
    const supabase = getExternalIntelligenceSupabaseClient({});
    const q = await supabase
      .from("sports_milestones_v1")
      .select("milestone_id,current_content_hash")
      .eq("milestone_id", milestone_id)
      .limit(1)
      .maybeSingle();
    if (q.error) throw new Error(`Failed to fetch milestone: ${q.error.message}`);
    if (!q.data) throw new PersistenceNotFoundError(`Milestone not found: ${milestone_id}`);
    return q.data as unknown as SportsMilestonesRow;
  }

  async listVersions(milestone_id: string): Promise<Array<{ milestone_id: string; content_hash: string; created_at: string }>> {
    const supabase = getExternalIntelligenceSupabaseClient({});
    const q = await supabase
      .from("sports_milestone_versions_v1")
      .select("milestone_id,content_hash,created_at")
      .eq("milestone_id", milestone_id)
      .order("created_at", { ascending: true });
    if (q.error) throw new Error(`Failed to list versions: ${q.error.message}`);
    return (q.data ?? []) as unknown as Array<{ milestone_id: string; content_hash: string; created_at: string }>;
  }

  async reconstructExactVersion(input: {
    milestone_id: string;
    content_hash: string;
  }): Promise<SportsMilestone> {
    const supabase = getExternalIntelligenceSupabaseClient({});

    const q = await supabase
      .from("sports_milestone_versions_v1")
      .select("milestone_id,content_hash,canonical_payload_json,created_at")
      .eq("milestone_id", input.milestone_id)
      .eq("content_hash", input.content_hash)
      .limit(1)
      .maybeSingle();

    if (q.error) throw new Error(`Failed to fetch milestone version: ${q.error.message}`);
    if (!q.data) {
      throw new PersistenceNotFoundError(`Milestone version not found: ${input.milestone_id}@${input.content_hash}`);
    }

    const row = q.data as unknown as SportsMilestoneVersionRow;
    try {
      return parseSportsMilestone(row.canonical_payload_json);
    } catch (e) {
      // Fail closed: do not attempt to "repair" corrupt rows in the repository.
      throw new PersistenceIdempotencyConflictError("integrity_conflict");
    }
  }
}
