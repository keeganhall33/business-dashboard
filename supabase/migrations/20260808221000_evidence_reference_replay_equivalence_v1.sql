-- EvidenceReference replay-equivalence fix (V1).
--
-- Problem:
-- - EvidenceReference semantic/version fingerprint intentionally excludes retrieval occurrence metadata.
-- - persist_external_evidence_reference_v1 enforced byte-identical payload_json on replay.
-- - Re-collecting the same semantic evidence changes retrieved_at / provenance_metadata.collected_at
--   (and may change provenance_metadata.rss_position), producing false integrity_conflict.
--
-- Fix:
-- - Keep all existing legal/governance equality checks.
-- - For payload_json equality on replay, compare normalized payloads where ONLY the allowlisted
--   volatile observation fields are stripped:
--     - retrieved_at
--     - provenance_metadata.collected_at
--     - provenance_metadata.rss_position
-- - Do NOT overwrite the immutable stored payload_json with the new timestamps.
--
-- NOTE: This is a forward migration (function semantics change). No table shape changes.

begin;

create or replace function persist_external_evidence_reference_v1(
  in_evidence_reference_id text,
  in_content_hash text,
  in_schema_version text,
  in_source_id text,
  in_source_config_version text,
  in_legal_policy_version text,
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
  in_payload_available boolean
)
returns table (
  evidence_reference_id text,
  content_hash text,
  created_new_version boolean,
  idempotent_replay boolean
)
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_jwt_role text;
  v_claims text;
  existing record;
  version_exists boolean;
  inserted_version boolean := false;
  replay boolean := false;
  existing_payload_norm jsonb;
  incoming_payload_norm jsonb;
begin
  -- Security: require PostgREST JWT service role (do not use session_user).
  v_jwt_role := nullif(current_setting('request.jwt.claim.role', true), '');
  if v_jwt_role is null then
    v_claims := nullif(current_setting('request.jwt.claims', true), '');
    if v_claims is not null then
      v_jwt_role := nullif((v_claims::jsonb ->> 'role'), '');
    end if;
  end if;
  if v_jwt_role is distinct from 'service_role' then
    raise exception using errcode = '42501', message = 'unauthorized';
  end if;

  if in_evidence_reference_id is null or length(in_evidence_reference_id) = 0 then
    raise exception using errcode = 'P0001', message = 'invalid_argument';
  end if;
  if in_content_hash is null or length(in_content_hash) = 0 then
    raise exception using errcode = 'P0001', message = 'invalid_argument';
  end if;
  if in_schema_version is null or length(in_schema_version) = 0 then
    raise exception 'schema_version required';
  end if;
  if in_source_id is null or length(in_source_id) = 0 then
    raise exception 'source_id required';
  end if;
  if in_source_config_version is null or length(in_source_config_version) = 0 then
    raise exception 'source_config_version required';
  end if;
  if in_legal_policy_version is null or length(in_legal_policy_version) = 0 then
    raise exception 'legal_policy_version required';
  end if;
  if in_policy_refs_json is null then
    raise exception 'policy_refs_json required';
  end if;
  if in_supersedes_content_hashes is null then
    raise exception 'supersedes_content_hashes required';
  end if;

  select * into existing
  from public.external_evidence_reference_versions_v1 ev
  where ev.evidence_reference_id = in_evidence_reference_id
    and ev.content_hash = in_content_hash;

  version_exists := found;

  if version_exists then
    -- Replay-equivalence normalization (V1): strip allowlisted volatile observation fields.
    existing_payload_norm := coalesce(existing.payload_json, '{}'::jsonb) - 'retrieved_at';
    incoming_payload_norm := coalesce(in_payload_json, '{}'::jsonb) - 'retrieved_at';

    existing_payload_norm := jsonb_set(
      existing_payload_norm,
      '{provenance_metadata}',
      (coalesce(existing_payload_norm->'provenance_metadata','{}'::jsonb) - 'collected_at' - 'rss_position'),
      true
    );
    incoming_payload_norm := jsonb_set(
      incoming_payload_norm,
      '{provenance_metadata}',
      (coalesce(incoming_payload_norm->'provenance_metadata','{}'::jsonb) - 'collected_at' - 'rss_position'),
      true
    );

    -- Idempotent replay rules: same (id,hash) must have identical legal state and
    -- identical SEMANTIC payload after volatile observation normalization.
    if not (
      existing.payload_available is not distinct from in_payload_available
      and existing_payload_norm is not distinct from incoming_payload_norm
      and existing.schema_version is not distinct from in_schema_version
      and existing.source_id is not distinct from in_source_id
      and existing.source_config_version is not distinct from in_source_config_version
      and existing.legal_policy_version is not distinct from in_legal_policy_version
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
    insert into public.external_evidence_references_v1(
      evidence_reference_id,
      current_content_hash,
      lifecycle_status,
      correction_status,
      source_id,
      source_config_version,
      legal_policy_version
    ) values (
      in_evidence_reference_id,
      in_content_hash,
      'new',
      'none',
      in_source_id,
      in_source_config_version,
      in_legal_policy_version
    ) on conflict on constraint external_evidence_references_v1_pkey do nothing;

    insert into public.external_evidence_reference_versions_v1(
      evidence_reference_id,
      content_hash,
      schema_version,
      source_id,
      source_config_version,
      legal_policy_version,
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
      in_evidence_reference_id,
      in_content_hash,
      in_schema_version,
      in_source_id,
      in_source_config_version,
      in_legal_policy_version,
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

  -- Stable row must point to an existing version row.
  update public.external_evidence_references_v1 es
    set current_content_hash = in_content_hash
  where es.evidence_reference_id = in_evidence_reference_id;

  evidence_reference_id := in_evidence_reference_id;
  content_hash := in_content_hash;
  created_new_version := inserted_version;
  idempotent_replay := replay;
  return next;
end;
$fn$;

commit;

