-- claim_replay_equivalence_v1 follow-up
--
-- Purpose:
-- The initial V1 semantic replay equivalence proved that the only Claim payload drift
-- was `payload_json.retrieved_at`. However, production replay still failed because
-- the *incoming* EvidenceReference VersionRef JSON contains a volatile `created_at`
-- value (generated at call time), while the persisted Claim version pins an older
-- `created_at` from the historical run.
--
-- We keep evidence pin semantics strict by comparing the EvidenceReference VersionRef
-- identity fields and allowing ONLY `evidence_reference_version_ref_json.created_at`
-- to drift in the semantic replay branch.
--
-- Constraints:
-- - No table shape change
-- - No constraint change
-- - No data rewrite

create or replace function persist_external_claim_v1(
  in_claim_id text,
  in_content_hash text,
  in_schema_version text,
  in_claim_fingerprint text,
  in_interpretation_policy_version text,
  in_interpretation_policy_hash text,
  in_evidence_reference_id text,
  in_evidence_content_hash text,
  in_evidence_version_ref_json jsonb,
  in_policy_refs_json jsonb,
  in_effective_at timestamptz,
  in_valid_from timestamptz,
  in_valid_until timestamptz,
  in_supersedes_content_hashes jsonb,
  in_payload_json jsonb,
  in_retention_policy text,
  in_retention_expires_at timestamptz,
  in_legal_hold boolean,
  in_access_revoked_at timestamptz,
  in_content_redacted_at timestamptz,
  in_redaction_reason text,
  in_payload_available boolean,
  in_edge_relation text,
  in_edge_policy_version text,
  in_edge_policy_hash text
)
returns table (
  claim_id text,
  content_hash text,
  created_new_version boolean,
  idempotent_replay boolean
)
language plpgsql
security definer
set search_path = public
as $fn$
declare
  existing record;
  semantic record;
  inserted_version boolean := false;
  replay boolean := false;
  edge_id text;
  normalized_existing jsonb;
  normalized_incoming jsonb;
begin
  perform 1 from public.external_evidence_reference_versions_v1 ev
  where ev.evidence_reference_id = in_evidence_reference_id
    and ev.content_hash = in_evidence_content_hash;
  if not found then
    raise exception 'MissingLinkedVersion: evidence_reference_id=% content_hash=%', in_evidence_reference_id, in_evidence_content_hash;
  end if;

  if (in_evidence_version_ref_json->>'object_type') is distinct from 'evidence_reference'
     or (in_evidence_version_ref_json->>'object_id') is distinct from in_evidence_reference_id
     or (in_evidence_version_ref_json->>'content_hash') is distinct from in_evidence_content_hash then
    raise exception using errcode = 'P0001', message = 'version_ref_mismatch';
  end if;

  -- Fast path: exact version identity replay by (claim_id, content_hash).
  select * into existing
  from public.external_claim_versions_v1 cv
  where cv.claim_id = in_claim_id
    and cv.content_hash = in_content_hash;

  if found then
    if not (
      existing.payload_available is not distinct from in_payload_available
      and existing.payload_json is not distinct from in_payload_json
      and existing.schema_version is not distinct from in_schema_version
      and existing.claim_fingerprint is not distinct from in_claim_fingerprint
      and existing.interpretation_policy_version is not distinct from in_interpretation_policy_version
      and existing.interpretation_policy_hash is not distinct from in_interpretation_policy_hash
      and existing.evidence_reference_version_ref_json is not distinct from in_evidence_version_ref_json
      and existing.policy_refs_json is not distinct from in_policy_refs_json
      and existing.effective_at is not distinct from in_effective_at
      and existing.valid_from is not distinct from in_valid_from
      and existing.valid_until is not distinct from in_valid_until
      and existing.supersedes_content_hashes is not distinct from in_supersedes_content_hashes
      and existing.retention_policy is not distinct from in_retention_policy
      and existing.retention_expires_at is not distinct from in_retention_expires_at
      and existing.legal_hold is not distinct from in_legal_hold
      and existing.access_revoked_at is not distinct from in_access_revoked_at
      and existing.content_redacted_at is not distinct from in_content_redacted_at
      and existing.redaction_reason is not distinct from in_redaction_reason
    ) then
      raise exception using errcode = 'P0001', message = 'integrity_conflict';
    end if;
    replay := true;
  else
    -- Semantic replay equivalence (V1): allow only payload_json.retrieved_at drift.
    select * into semantic
    from public.external_claim_versions_v1 cv
    where cv.claim_id = in_claim_id
      and cv.payload_available = true
      and cv.claim_fingerprint is not distinct from in_claim_fingerprint
      and cv.interpretation_policy_hash is not distinct from in_interpretation_policy_hash
    limit 1;

    if found then
      -- Require exact match for all protected fields except payload_json.retrieved_at.
      -- NOTE: EvidenceReference VersionRef is compared with `created_at` removed.
      if not (
        semantic.payload_available is not distinct from in_payload_available
        and semantic.schema_version is not distinct from in_schema_version
        and semantic.claim_fingerprint is not distinct from in_claim_fingerprint
        and semantic.interpretation_policy_version is not distinct from in_interpretation_policy_version
        and semantic.interpretation_policy_hash is not distinct from in_interpretation_policy_hash
        and (coalesce(semantic.evidence_reference_version_ref_json, '{}'::jsonb) - 'created_at') is not distinct from (coalesce(in_evidence_version_ref_json, '{}'::jsonb) - 'created_at')
        and semantic.policy_refs_json is not distinct from in_policy_refs_json
        and semantic.effective_at is not distinct from in_effective_at
        and semantic.valid_from is not distinct from in_valid_from
        and semantic.valid_until is not distinct from in_valid_until
        and semantic.supersedes_content_hashes is not distinct from in_supersedes_content_hashes
        and semantic.retention_policy is not distinct from in_retention_policy
        and semantic.retention_expires_at is not distinct from in_retention_expires_at
        and semantic.legal_hold is not distinct from in_legal_hold
        and semantic.access_revoked_at is not distinct from in_access_revoked_at
        and semantic.content_redacted_at is not distinct from in_content_redacted_at
        and semantic.redaction_reason is not distinct from in_redaction_reason
      ) then
        raise exception using errcode = 'P0001', message = 'claim_version_identity_conflict';
      end if;

      normalized_existing := (coalesce(semantic.payload_json, '{}'::jsonb) - 'retrieved_at');
      normalized_incoming := (coalesce(in_payload_json, '{}'::jsonb) - 'retrieved_at');

      if normalized_existing is not distinct from normalized_incoming then
        -- Idempotent semantic replay: return the existing immutable version hash.
        in_content_hash := semantic.content_hash;
        replay := true;
      else
        raise exception using errcode = 'P0001', message = 'claim_version_identity_conflict';
      end if;
    else
      -- Legitimate new version behavior unchanged.
      insert into external_claims_v1(
        claim_id,
        current_content_hash,
        lifecycle_status,
        correction_status,
        interpretation_policy_version
      ) values (
        in_claim_id,
        in_content_hash,
        'new',
        'none',
        in_interpretation_policy_version
      ) on conflict on constraint external_claims_v1_pkey do nothing;

      insert into external_claim_versions_v1(
        claim_id,
        content_hash,
        schema_version,
        claim_fingerprint,
        interpretation_policy_version,
        interpretation_policy_hash,
        evidence_reference_version_ref_json,
        policy_refs_json,
        effective_at,
        valid_from,
        valid_until,
        supersedes_content_hashes,
        payload_json,
        retention_policy,
        retention_expires_at,
        legal_hold,
        access_revoked_at,
        content_redacted_at,
        redaction_reason,
        payload_available
      ) values (
        in_claim_id,
        in_content_hash,
        in_schema_version,
        in_claim_fingerprint,
        in_interpretation_policy_version,
        in_interpretation_policy_hash,
        in_evidence_version_ref_json,
        in_policy_refs_json,
        in_effective_at,
        in_valid_from,
        in_valid_until,
        in_supersedes_content_hashes,
        in_payload_json,
        in_retention_policy,
        in_retention_expires_at,
        in_legal_hold,
        in_access_revoked_at,
        in_content_redacted_at,
        in_redaction_reason,
        in_payload_available
      );
      inserted_version := true;
    end if;
  end if;

  update public.external_claims_v1 cs
    set current_content_hash = in_content_hash
  where cs.claim_id = in_claim_id;

  edge_id := encode(extensions.digest(jsonb_build_object(
    'from_object_type','claim',
    'from_object_id',in_claim_id,
    'from_content_hash',in_content_hash,
    'to_object_type','evidence_reference',
    'to_object_id',in_evidence_reference_id,
    'to_content_hash',in_evidence_content_hash,
    'relation',in_edge_relation,
    'policy_hash',in_edge_policy_hash
  )::text, 'sha256'::text), 'hex');

  insert into external_provenance_edges_v1(
    edge_id,
    from_object_type,from_object_id,from_content_hash,
    to_object_type,to_object_id,to_content_hash,
    relation,
    policy_version,
    policy_hash,
    from_ref_json,
    to_ref_json,
    metadata_json
  ) values (
    edge_id,
    'claim',in_claim_id,in_content_hash,
    'evidence_reference',in_evidence_reference_id,in_evidence_content_hash,
    in_edge_relation,
    in_edge_policy_version,
    in_edge_policy_hash,
    jsonb_build_object('object_type','claim','object_id',in_claim_id,'content_hash',in_content_hash,'schema_version',in_schema_version,'policy_version',in_interpretation_policy_version,'version_id',null,'created_at',now()),
    in_evidence_version_ref_json,
    '{}'::jsonb
  ) on conflict (
    from_object_type,from_object_id,from_content_hash,
    to_object_type,to_object_id,to_content_hash,
    relation,
    policy_hash
  ) do nothing;

  claim_id := in_claim_id;
  content_hash := in_content_hash;
  created_new_version := inserted_version;
  idempotent_replay := replay;
  return next;
end;
$fn$;

