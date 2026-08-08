-- Fix: pgcrypto digest resolves from extensions schema under SECURITY DEFINER search_path=public.
-- Scope: persist_external_signal_write_set_v1 only.
-- Surgical change: schema-qualify digest + explicitly type algorithm arg as text.

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
  in_output_refs_json jsonb,

  in_optional_lifecycle_transition_json jsonb default null
)
returns table (
  signal_id text,
  content_hash text,
  created_new_version boolean,
  idempotent_replay boolean,
  persisted_provenance_count integer,
  persisted_contribution_count integer,
  resulting_run_status text
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
  v jsonb;
  obj_id text;
  obj_hash text;
  edge jsonb;
  edge_id text;
  contrib jsonb;
  inserted_edges integer := 0;
  inserted_contribs integer := 0;
  rc integer;
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


  if in_signal_id is null or length(in_signal_id) = 0 then
    raise exception using errcode = 'P0001', message = 'invalid_argument';
  end if;
  if in_content_hash is null or length(in_content_hash) = 0 then
    raise exception using errcode = 'P0001', message = 'invalid_argument';
  end if;
  if in_schema_version is null or length(in_schema_version) = 0 then
    raise exception using errcode = 'P0001', message = 'invalid_argument';
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
      raise exception using errcode = 'P0001', message = 'object_type_mismatch';
    end if;
    obj_id := v->>'object_id';
    obj_hash := v->>'content_hash';
    if obj_id is null or obj_hash is null then
      raise exception using errcode = 'P0001', message = 'version_ref_mismatch';
    end if;
    perform 1 from public.external_claim_versions_v1 cv where cv.claim_id = obj_id and cv.content_hash = obj_hash;
    if not found then
      raise exception using errcode = 'P0001', message = 'linked_version_not_found';
    end if;
  end loop;

  -- Validate pinned evidence versions exist.
  for v in select * from jsonb_array_elements(in_evidence_reference_version_refs_json)
  loop
    if (v->>'object_type') is distinct from 'evidence_reference' then
      raise exception using errcode = 'P0001', message = 'object_type_mismatch';
    end if;
    obj_id := v->>'object_id';
    obj_hash := v->>'content_hash';
    if obj_id is null or obj_hash is null then
      raise exception using errcode = 'P0001', message = 'version_ref_mismatch';
    end if;
    perform 1
    from public.external_evidence_reference_versions_v1 ev
    where ev.evidence_reference_id = obj_id
      and ev.content_hash = obj_hash;
    if not found then
      raise exception using errcode = 'P0001', message = 'linked_version_not_found';
    end if;
  end loop;

  select * into existing
  from public.external_signal_versions_v1 sv
  where sv.signal_id = in_signal_id
    and sv.content_hash = in_content_hash;

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
      raise exception using errcode = 'P0001', message = 'integrity_conflict';
    end if;
    replay := true;
  else
    insert into public.external_signals_v1(
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
    ) on conflict on constraint external_signals_v1_pkey do nothing;

    insert into public.external_signal_versions_v1(
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

  update public.external_signals_v1 ss
    set current_content_hash = in_content_hash,
        disposition = in_disposition,
        confidence_summary_json = in_confidence_summary_json
  where ss.signal_id = in_signal_id;

  -- Persist required provenance edges (idempotent, no misleading polymorphic FKs).
  for edge in select * from jsonb_array_elements(in_required_provenance_edges_json)
  loop
    -- Validate normalized endpoint fields agree with VersionRef JSON.
    if (edge->'from_ref_json'->>'object_type') is distinct from (edge->>'from_object_type')
       or (edge->'from_ref_json'->>'object_id') is distinct from (edge->>'from_object_id')
       or (edge->'from_ref_json'->>'content_hash') is distinct from (edge->>'from_content_hash')
       or (edge->'to_ref_json'->>'object_type') is distinct from (edge->>'to_object_type')
       or (edge->'to_ref_json'->>'object_id') is distinct from (edge->>'to_object_id')
       or (edge->'to_ref_json'->>'content_hash') is distinct from (edge->>'to_content_hash') then
      raise exception using errcode = 'P0001', message = 'version_ref_mismatch';
    end if;

    edge_id := encode(extensions.digest(edge::text, 'sha256'::text), 'hex');
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

    get diagnostics rc = row_count;
    inserted_edges := inserted_edges + rc;
  end loop;

  -- Persist required source contributions (idempotent).
  for contrib in select * from jsonb_array_elements(in_required_source_contributions_json)
  loop
    -- Validate normalized endpoint fields agree with VersionRef JSON.
    if (contrib->'target_ref_json'->>'object_type') is distinct from (contrib->>'target_object_type')
       or (contrib->'target_ref_json'->>'object_id') is distinct from (contrib->>'target_object_id')
       or (contrib->'target_ref_json'->>'content_hash') is distinct from (contrib->>'target_content_hash') then
      raise exception using errcode = 'P0001', message = 'version_ref_mismatch';
    end if;

    insert into public.external_source_contributions_v1(
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

    get diagnostics rc = row_count;
    inserted_contribs := inserted_contribs + rc;
  end loop;

  -- Optional lifecycle transition (idempotent).
  if in_optional_lifecycle_transition_json is not null then
    insert into public.external_lifecycle_transitions_v1(
      transition_id,
      object_type,object_id,content_hash,
      object_ref_json,
      from_status,to_status,effective_at,reason_codes,
      policy_version,policy_hash
    ) values (
      in_optional_lifecycle_transition_json->>'transition_id',
      in_optional_lifecycle_transition_json->>'object_type',
      in_optional_lifecycle_transition_json->>'object_id',
      in_optional_lifecycle_transition_json->>'content_hash',
      in_optional_lifecycle_transition_json->'object_ref_json',
      in_optional_lifecycle_transition_json->>'from_status',
      in_optional_lifecycle_transition_json->>'to_status',
      (in_optional_lifecycle_transition_json->>'effective_at')::timestamptz,
      coalesce(in_optional_lifecycle_transition_json->'reason_codes','[]'::jsonb),
      in_optional_lifecycle_transition_json->>'policy_version',
      in_optional_lifecycle_transition_json->>'policy_hash'
    ) on conflict (object_type,object_id,content_hash,from_status,to_status,effective_at,policy_hash) do nothing;
  end if;

  -- Optionally attach run outputs (no completion/status mutation here).
  if in_run_id is not null and length(in_run_id) > 0 then
    perform 1 from public.external_processing_runs_v1 where run_id = in_run_id;
    if not found then
      raise exception using errcode = 'P0001', message = 'linked_version_not_found';
    end if;

    update public.external_processing_runs_v1
      set output_refs_json = in_output_refs_json,
          expected_output_count = in_expected_output_count,
          persisted_output_count = jsonb_array_length(in_output_refs_json)
    where run_id = in_run_id;

    select status into resulting_run_status from public.external_processing_runs_v1 where run_id = in_run_id;
  else
    resulting_run_status := null;
  end if;

  signal_id := in_signal_id;
  content_hash := in_content_hash;
  created_new_version := inserted_version;
  idempotent_replay := replay;
  persisted_provenance_count := inserted_edges;
  persisted_contribution_count := inserted_contribs;
  return next;
end;
$fn$;

revoke all on function persist_external_signal_write_set_v1(
  text,text,text,text,text,text,text,text,text,text,text,
  jsonb,jsonb,jsonb,
  timestamptz,timestamptz,timestamptz,jsonb,
  jsonb,text,timestamptz,boolean,timestamptz,timestamptz,text,boolean,
  text,jsonb,
  jsonb,jsonb,
  text,integer,jsonb,
  jsonb
) from public;
revoke all on function persist_external_signal_write_set_v1(
  text,text,text,text,text,text,text,text,text,text,text,
  jsonb,jsonb,jsonb,
  timestamptz,timestamptz,timestamptz,jsonb,
  jsonb,text,timestamptz,boolean,timestamptz,timestamptz,text,boolean,
  text,jsonb,
  jsonb,jsonb,
  text,integer,jsonb,
  jsonb
) from anon;
revoke all on function persist_external_signal_write_set_v1(
  text,text,text,text,text,text,text,text,text,text,text,
  jsonb,jsonb,jsonb,
  timestamptz,timestamptz,timestamptz,jsonb,
  jsonb,text,timestamptz,boolean,timestamptz,timestamptz,text,boolean,
  text,jsonb,
  jsonb,jsonb,
  text,integer,jsonb,
  jsonb
) from authenticated;

grant execute on function persist_external_signal_write_set_v1(
  text,text,text,text,text,text,text,text,text,text,text,
  jsonb,jsonb,jsonb,
  timestamptz,timestamptz,timestamptz,jsonb,
  jsonb,text,timestamptz,boolean,timestamptz,timestamptz,text,boolean,
  text,jsonb,
  jsonb,jsonb,
  text,integer,jsonb,
  jsonb
) to service_role;
