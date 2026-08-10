-- PERSISTENCE_BOUNDARY_HARDENING_CANDIDATE_V1
--
-- Purpose:
-- - Harden Evidence + Claim persistence RPCs so caller-supplied version hashes are NOT authoritative.
-- - DB validates:
--   (1) inner retained_payload_hash matches canonical retained payload projection persisted in payload_json
--   (2) outer EvidenceVersion fingerprint matches canonical semantic tuple (Contract X) using the validated inner hash
--   (3) ClaimVersion content hash matches canonical claim payload bytes
-- - Historical rows remain immutable; validation applies only to NEW version inserts.
--
-- IMPORTANT:
-- - Do not apply to production until cross-runtime TS↔DB test vectors prove identical hashing.
-- - This migration does not rewrite historical versions.

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

-- =========================================================
-- Canonical hashing helpers (DB side)
-- =========================================================

-- Canonical JSON SHA-256 hex.
-- NOTE: relies on jsonb::text deterministic key ordering.
-- Cross-runtime equivalence MUST be proven against TS canonical hashing.
create or replace function ei_canonical_json_sha256_hex_v1(in_value jsonb)
returns text
language sql
immutable
as $$
  select encode(extensions.digest(coalesce(in_value, '{}'::jsonb)::text, 'sha256'), 'hex');
$$;

-- Targeted-web structured_metadata retained payload hash.
-- Contract: payload_json.retained_payload contains the canonical projection object
-- (already normalized by TS, including HTML entity decode-once policy).
create or replace function ei_retained_payload_hash_v1(in_payload_json jsonb)
returns text
language plpgsql
immutable
as $fn$
declare
  retained jsonb;
begin
  retained := in_payload_json->'retained_payload';
  if retained is null then
    raise exception using errcode='P0001', message='invalid_argument';
  end if;
  return ei_canonical_json_sha256_hex_v1(retained);
end;
$fn$;

-- EvidenceVersion fingerprint (Contract X) computed in DB.
create or replace function ei_evidence_version_fingerprint_contract_x_v1(
  in_source_id text,
  in_source_config_version text,
  in_source_set_id text,
  in_source_artifact_identifier text,
  in_source_url_or_reference text,
  in_retained_payload_hash text,
  in_published_at timestamptz,
  in_event_time timestamptz,
  in_evidence_type text,
  in_access_classification text,
  in_legal_policy_version text,
  in_retention_policy text,
  in_excerpt_or_summary_reference text,
  in_source_credibility_prior text,
  in_correction_status text,
  in_retraction_status text,
  in_supersedes_evidence_reference_id text,
  in_schema_version text
)
returns text
language sql
immutable
as $$
  select ei_canonical_json_sha256_hex_v1(
    jsonb_build_object(
      'source_id', in_source_id,
      'source_config_version', in_source_config_version,
      'source_set_id', in_source_set_id,
      'source_artifact_identifier', in_source_artifact_identifier,
      'source_url_or_reference', in_source_url_or_reference,
      'content_hash', in_retained_payload_hash,
      'published_at', in_published_at,
      'event_time', in_event_time,
      'evidence_type', in_evidence_type,
      'access_classification', in_access_classification,
      'legal_policy_version', in_legal_policy_version,
      'retention_policy', in_retention_policy,
      'excerpt_or_summary_reference', in_excerpt_or_summary_reference,
      'source_credibility_prior', in_source_credibility_prior,
      'correction_status', in_correction_status,
      'retraction_status', in_retraction_status,
      'supersedes_evidence_reference_id', in_supersedes_evidence_reference_id,
      'schema_version', in_schema_version
    )
  );
$$;

-- ClaimVersion content hash computed in DB.
create or replace function ei_claim_version_content_hash_v1(in_claim_payload jsonb)
returns text
language sql
immutable
as $$
  select ei_canonical_json_sha256_hex_v1(in_claim_payload);
$$;

-- =========================================================
-- Harden RPC: persist_external_evidence_reference_v1
-- =========================================================

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
  inner_hash_db text;
  inner_hash_asserted text;
  outer_hash_db text;
begin
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

  select * into existing
  from public.external_evidence_reference_versions_v1
  where evidence_reference_id = in_evidence_reference_id
    and content_hash = in_content_hash;

  version_exists := found;

  if version_exists then
    -- Existing-version replay behavior unchanged.
    if not (
      existing.payload_available is not distinct from in_payload_available
      and (
        jsonb_set(
          (coalesce(existing.payload_json, '{}'::jsonb) - 'retrieved_at'),
          '{provenance_metadata}',
          (coalesce((coalesce(existing.payload_json, '{}'::jsonb) - 'retrieved_at')->'provenance_metadata','{}'::jsonb)
            - 'collected_at' - 'rss_position'),
          true
        )
      ) is not distinct from (
        jsonb_set(
          (coalesce(in_payload_json, '{}'::jsonb) - 'retrieved_at'),
          '{provenance_metadata}',
          (coalesce((coalesce(in_payload_json, '{}'::jsonb) - 'retrieved_at')->'provenance_metadata','{}'::jsonb)
            - 'collected_at' - 'rss_position'),
          true
        )
      )
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
    -- NEW-WRITE hardening: validate inner retained payload hash + outer fingerprint.
    inner_hash_db := ei_retained_payload_hash_v1(in_payload_json);
    inner_hash_asserted := nullif(in_payload_json->>'content_hash', '');
    if inner_hash_asserted is distinct from inner_hash_db then
      raise exception using errcode='P0001', message='retained_payload_hash_mismatch';
    end if;

    outer_hash_db := ei_evidence_version_fingerprint_contract_x_v1(
      in_source_id,
      in_source_config_version,
      null,
      null,
      (in_payload_json->>'source_url_or_reference'),
      inner_hash_db,
      null,
      null,
      (in_payload_json->>'evidence_type'),
      (in_payload_json->>'access_classification'),
      in_legal_policy_version,
      in_retention_policy,
      null,
      (in_payload_json->>'source_credibility_prior'),
      (in_payload_json->>'correction_status'),
      (in_payload_json->>'retraction_status'),
      null,
      in_schema_version
    );

    if in_content_hash is distinct from outer_hash_db then
      raise exception using errcode='P0001', message='evidence_version_fingerprint_mismatch';
    end if;

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
    ) on conflict (evidence_reference_id) do nothing;

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

-- =========================================================
-- Harden RPC: persist_external_claim_v1
-- =========================================================

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
  v_jwt_role text;
  v_claims text;
  existing record;
  inserted_version boolean := false;
  replay boolean := false;
  evidence_ok boolean;
  edge_id text;
  claim_hash_db text;
begin
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

  -- Validate pinned evidence exists.
  select true into evidence_ok
  from public.external_evidence_reference_versions_v1 ev
  where ev.evidence_reference_id = in_evidence_reference_id
    and ev.content_hash = in_evidence_content_hash;
  if not found then
    raise exception using errcode = 'P0001', message = 'linked_version_not_found';
  end if;

  -- Existing-version replay unchanged.
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
    -- NEW-WRITE hardening: validate claim version content hash.
    claim_hash_db := ei_claim_version_content_hash_v1(in_payload_json);
    if in_content_hash is distinct from claim_hash_db then
      raise exception using errcode='P0001', message='claim_version_content_hash_mismatch';
    end if;

    insert into public.external_claims_v1(
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
    ) on conflict (claim_id) do nothing;

    insert into public.external_claim_versions_v1(
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

  update public.external_claims_v1 cs
    set current_content_hash = in_content_hash
  where cs.claim_id = in_claim_id;

  -- Persist required edge unchanged.
  edge_id := encode(extensions.digest(jsonb_build_object(
    'from_object_type','claim',
    'from_object_id',in_claim_id,
    'from_content_hash',in_content_hash,
    'to_object_type','evidence_reference',
    'to_object_id',in_evidence_reference_id,
    'to_content_hash',in_evidence_content_hash,
    'relation',in_edge_relation,
    'policy_hash',in_edge_policy_hash
  )::text, 'sha256'), 'hex');

  insert into public.external_provenance_edges_v1(
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
