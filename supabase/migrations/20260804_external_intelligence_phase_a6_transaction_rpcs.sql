-- Phase A6.1: Transactional Persistence RPC Foundation
-- Scope: narrowly scoped atomic RPCs for external-intelligence stable+version write sets.

-- NOTE: These functions are intentionally explicit/typed. No generic dynamic SQL persistence.

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
  existing record;
  stable_exists boolean;
  version_exists boolean;
  inserted_version boolean := false;
  replay boolean := false;
begin
  if in_evidence_reference_id is null or length(in_evidence_reference_id) = 0 then
    raise exception 'evidence_reference_id required';
  end if;
  if in_content_hash is null or length(in_content_hash) = 0 then
    raise exception 'content_hash required';
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
  from external_evidence_reference_versions_v1
  where evidence_reference_id = in_evidence_reference_id
    and content_hash = in_content_hash;

  version_exists := found;

  if version_exists then
    -- Idempotent replay rules: same (id,hash) must have identical payload bytes and legal state.
    if not (
      existing.payload_available is not distinct from in_payload_available
      and existing.payload_json is not distinct from in_payload_json
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
      raise exception 'IntegrityConflict: evidence_reference_id=% content_hash=% already exists with different payload/legal state', in_evidence_reference_id, in_content_hash;
    end if;
    replay := true;
  else
    insert into external_evidence_references_v1(
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

    insert into external_evidence_reference_versions_v1(
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
  update external_evidence_references_v1
    set current_content_hash = in_content_hash
  where evidence_reference_id = in_evidence_reference_id;

  evidence_reference_id := in_evidence_reference_id;
  content_hash := in_content_hash;
  created_new_version := inserted_version;
  idempotent_replay := replay;
  return next;
end;
$fn$;

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
  inserted_version boolean := false;
  replay boolean := false;
  evidence_ok boolean;
  edge_id text;
begin
  if in_claim_id is null or length(in_claim_id) = 0 then
    raise exception 'claim_id required';
  end if;
  if in_content_hash is null or length(in_content_hash) = 0 then
    raise exception 'content_hash required';
  end if;
  if in_schema_version is null or length(in_schema_version) = 0 then
    raise exception 'schema_version required';
  end if;
  if in_claim_fingerprint is null or length(in_claim_fingerprint) = 0 then
    raise exception 'claim_fingerprint required';
  end if;
  if in_interpretation_policy_version is null or length(in_interpretation_policy_version) = 0 then
    raise exception 'interpretation_policy_version required';
  end if;
  if in_interpretation_policy_hash is null or length(in_interpretation_policy_hash) = 0 then
    raise exception 'interpretation_policy_hash required';
  end if;
  if in_evidence_reference_id is null or length(in_evidence_reference_id) = 0 then
    raise exception 'evidence_reference_id required';
  end if;
  if in_evidence_content_hash is null or length(in_evidence_content_hash) = 0 then
    raise exception 'evidence content_hash required';
  end if;

  -- Validate pinned evidence version exists.
  select true into evidence_ok
  from external_evidence_reference_versions_v1
  where evidence_reference_id = in_evidence_reference_id
    and content_hash = in_evidence_content_hash;

  if not found then
    raise exception 'MissingLinkedVersion: evidence_reference_id=% content_hash=%', in_evidence_reference_id, in_evidence_content_hash;
  end if;

  -- Validate VersionRef JSON agrees with normalized pins.
  if (in_evidence_version_ref_json->>'object_type') is distinct from 'evidence_reference'
     or (in_evidence_version_ref_json->>'object_id') is distinct from in_evidence_reference_id
     or (in_evidence_version_ref_json->>'content_hash') is distinct from in_evidence_content_hash then
    raise exception 'VersionRefMismatch: evidence ref json does not match normalized pins';
  end if;

  select * into existing
  from external_claim_versions_v1
  where claim_id = in_claim_id
    and content_hash = in_content_hash;

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
      raise exception 'IntegrityConflict: claim_id=% content_hash=% already exists with different payload/legal state', in_claim_id, in_content_hash;
    end if;
    replay := true;
  else
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
    ) on conflict (claim_id) do nothing;

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

  update external_claims_v1
    set current_content_hash = in_content_hash
  where claim_id = in_claim_id;

  -- Persist required claim->evidence provenance edge (idempotent).
  edge_id := encode(digest(jsonb_build_object(
    'from_object_type','claim',
    'from_object_id',in_claim_id,
    'from_content_hash',in_content_hash,
    'to_object_type','evidence_reference',
    'to_object_id',in_evidence_reference_id,
    'to_content_hash',in_evidence_content_hash,
    'relation',in_edge_relation,
    'policy_hash',in_edge_policy_hash
  )::text, 'sha256'), 'hex');

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

create or replace function persist_external_signal_write_set_v1(
  in_signal_id text,
  in_content_hash text,
  in_schema_version text,
  in_signal_fingerprint text,

  in_interpretation_policy_version text,
  in_interpretation_policy_hash text,
  in_confidence_policy_version text,
  in_disposition_policy_version text,
  in_entity_resolution_version text,
  in_source_registry_version text,
  in_legal_policy_version text,

  in_policy_refs_json jsonb,
  in_claim_version_refs_json jsonb,
  in_evidence_reference_version_refs_json jsonb,

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

  in_disposition text,
  in_confidence_summary_json jsonb,

  in_required_provenance_edges_json jsonb,
  in_required_source_contributions_json jsonb,

  in_run_id text,
  in_expected_output_count integer,
  in_output_refs_json jsonb
)
returns table (
  signal_id text,
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
  inserted_version boolean := false;
  replay boolean := false;
  v jsonb;
  obj_id text;
  obj_hash text;
  edge jsonb;
  edge_id text;
  contrib jsonb;
begin
  if in_signal_id is null or length(in_signal_id) = 0 then
    raise exception 'signal_id required';
  end if;
  if in_content_hash is null or length(in_content_hash) = 0 then
    raise exception 'content_hash required';
  end if;
  if in_schema_version is null or length(in_schema_version) = 0 then
    raise exception 'schema_version required';
  end if;
  if in_policy_refs_json is null then
    raise exception 'policy_refs_json required';
  end if;
  if in_claim_version_refs_json is null then
    raise exception 'claim_version_refs_json required';
  end if;
  if in_evidence_reference_version_refs_json is null then
    raise exception 'evidence_reference_version_refs_json required';
  end if;
  if in_supersedes_content_hashes is null then
    raise exception 'supersedes_content_hashes required';
  end if;
  if in_required_provenance_edges_json is null then
    raise exception 'required_provenance_edges_json required';
  end if;
  if in_required_source_contributions_json is null then
    raise exception 'required_source_contributions_json required';
  end if;

  -- Validate pinned claim versions exist.
  for v in select * from jsonb_array_elements(in_claim_version_refs_json)
  loop
    if (v->>'object_type') is distinct from 'claim' then
      raise exception 'VersionRefMismatch: claim_version_refs_json contains non-claim object_type';
    end if;
    obj_id := v->>'object_id';
    obj_hash := v->>'content_hash';
    if obj_id is null or obj_hash is null then
      raise exception 'VersionRefMismatch: claim VersionRef missing object_id/content_hash';
    end if;
    perform 1 from external_claim_versions_v1 where claim_id = obj_id and content_hash = obj_hash;
    if not found then
      raise exception 'MissingLinkedVersion: claim_id=% content_hash=%', obj_id, obj_hash;
    end if;
  end loop;

  -- Validate pinned evidence versions exist.
  for v in select * from jsonb_array_elements(in_evidence_reference_version_refs_json)
  loop
    if (v->>'object_type') is distinct from 'evidence_reference' then
      raise exception 'VersionRefMismatch: evidence_reference_version_refs_json contains non-evidence_reference object_type';
    end if;
    obj_id := v->>'object_id';
    obj_hash := v->>'content_hash';
    if obj_id is null or obj_hash is null then
      raise exception 'VersionRefMismatch: evidence VersionRef missing object_id/content_hash';
    end if;
    perform 1 from external_evidence_reference_versions_v1 where evidence_reference_id = obj_id and content_hash = obj_hash;
    if not found then
      raise exception 'MissingLinkedVersion: evidence_reference_id=% content_hash=%', obj_id, obj_hash;
    end if;
  end loop;

  select * into existing
  from external_signal_versions_v1
  where signal_id = in_signal_id
    and content_hash = in_content_hash;

  if found then
    if not (
      existing.payload_available is not distinct from in_payload_available
      and existing.payload_json is not distinct from in_payload_json
      and existing.schema_version is not distinct from in_schema_version
      and existing.signal_fingerprint is not distinct from in_signal_fingerprint
      and existing.interpretation_policy_version is not distinct from in_interpretation_policy_version
      and existing.interpretation_policy_hash is not distinct from in_interpretation_policy_hash
      and existing.confidence_policy_version is not distinct from in_confidence_policy_version
      and existing.disposition_policy_version is not distinct from in_disposition_policy_version
      and existing.entity_resolution_version is not distinct from in_entity_resolution_version
      and existing.source_registry_version is not distinct from in_source_registry_version
      and existing.legal_policy_version is not distinct from in_legal_policy_version
      and existing.policy_refs_json is not distinct from in_policy_refs_json
      and existing.claim_version_refs_json is not distinct from in_claim_version_refs_json
      and existing.evidence_reference_version_refs_json is not distinct from in_evidence_reference_version_refs_json
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
      raise exception 'IntegrityConflict: signal_id=% content_hash=% already exists with different payload/legal state', in_signal_id, in_content_hash;
    end if;
    replay := true;
  else
    insert into external_signals_v1(
      signal_id,
      current_content_hash,
      lifecycle_status,
      correction_status,
      disposition,
      confidence_summary_json
    ) values (
      in_signal_id,
      in_content_hash,
      'new',
      'none',
      in_disposition,
      in_confidence_summary_json
    ) on conflict (signal_id) do nothing;

    insert into external_signal_versions_v1(
      signal_id,
      content_hash,
      schema_version,
      signal_fingerprint,
      interpretation_policy_version,
      interpretation_policy_hash,
      confidence_policy_version,
      disposition_policy_version,
      entity_resolution_version,
      source_registry_version,
      legal_policy_version,
      policy_refs_json,
      claim_version_refs_json,
      evidence_reference_version_refs_json,
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
      in_signal_id,
      in_content_hash,
      in_schema_version,
      in_signal_fingerprint,
      in_interpretation_policy_version,
      in_interpretation_policy_hash,
      in_confidence_policy_version,
      in_disposition_policy_version,
      in_entity_resolution_version,
      in_source_registry_version,
      in_legal_policy_version,
      in_policy_refs_json,
      in_claim_version_refs_json,
      in_evidence_reference_version_refs_json,
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

  update external_signals_v1
    set current_content_hash = in_content_hash,
        disposition = in_disposition,
        confidence_summary_json = in_confidence_summary_json
  where signal_id = in_signal_id;

  -- Persist required provenance edges (idempotent, no misleading polymorphic FKs).
  for edge in select * from jsonb_array_elements(in_required_provenance_edges_json)
  loop
    edge_id := encode(digest(edge::text, 'sha256'), 'hex');
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
      edge->>'from_object_type', edge->>'from_object_id', edge->>'from_content_hash',
      edge->>'to_object_type', edge->>'to_object_id', edge->>'to_content_hash',
      edge->>'relation',
      edge->>'policy_version',
      edge->>'policy_hash',
      edge->'from_ref_json',
      edge->'to_ref_json',
      coalesce(edge->'metadata_json','{}'::jsonb)
    ) on conflict (
      from_object_type,from_object_id,from_content_hash,
      to_object_type,to_object_id,to_content_hash,
      relation,
      policy_hash
    ) do nothing;
  end loop;

  -- Persist required source contributions (idempotent).
  for contrib in select * from jsonb_array_elements(in_required_source_contributions_json)
  loop
    insert into external_source_contributions_v1(
      contribution_id,
      target_object_type,target_object_id,target_content_hash,target_ref_json,
      source_id,source_set_id,
      evidence_reference_object_id,evidence_reference_content_hash,evidence_reference_version_ref_json
    ) values (
      contrib->>'contribution_id',
      contrib->>'target_object_type', contrib->>'target_object_id', contrib->>'target_content_hash', contrib->'target_ref_json',
      contrib->>'source_id', contrib->>'source_set_id',
      contrib->>'evidence_reference_object_id', contrib->>'evidence_reference_content_hash', contrib->'evidence_reference_version_ref_json'
    ) on conflict (
      target_object_type,target_object_id,target_content_hash,source_id,evidence_reference_object_id,evidence_reference_content_hash
    ) do nothing;
  end loop;

  -- Optionally attach run outputs (no completion/status mutation here).
  if in_run_id is not null and length(in_run_id) > 0 then
    perform 1 from external_processing_runs_v1 where run_id = in_run_id;
    if not found then
      raise exception 'MissingLinkedRun: run_id=%', in_run_id;
    end if;

    update external_processing_runs_v1
      set output_refs_json = in_output_refs_json,
          expected_output_count = in_expected_output_count,
          persisted_output_count = jsonb_array_length(in_output_refs_json)
    where run_id = in_run_id;
  end if;

  signal_id := in_signal_id;
  content_hash := in_content_hash;
  created_new_version := inserted_version;
  idempotent_replay := replay;
  return next;
end;
$fn$;
