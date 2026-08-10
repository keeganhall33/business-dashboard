-- External Intelligence RPC auth: use auth.jwt() claims surface (Supabase-supported)
--
-- Background:
-- - Production observed auth headers carrying a legacy service_role JWT,
--   but DB-side claim-reading via current_setting('request.jwt.claim.*') returned blanks.
-- - Supabase guidance: read JWT claims via auth.jwt().
--
-- Scope:
-- - Update debug_request_jwt_role_v1() to report auth.jwt role/ref and legacy surfaces side-by-side.
-- - Update governed persistence RPCs to authorize using auth.jwt()->>'role' = 'service_role'
--   (no weakening; preserves service_role-only gate).
--
-- Safety:
-- - No table reads added.
-- - No writes performed by the debug function.
-- - No secrets/JWT contents are returned.

-- 1) Diagnostic role echo: compare claim surfaces within the SAME request.
create or replace function public.debug_request_jwt_role_v1()
returns jsonb
language plpgsql
stable
as $$
declare
  v_auth jsonb;
  v_auth_role text;
  v_auth_ref text;
  v_legacy_role text;
  v_legacy_ref text;
begin
  v_auth := auth.jwt();
  v_auth_role := nullif((v_auth ->> 'role'), '');
  v_auth_ref := nullif((v_auth ->> 'ref'), '');

  v_legacy_role := nullif(current_setting('request.jwt.claim.role', true), '');
  v_legacy_ref := nullif(current_setting('request.jwt.claim.ref', true), '');

  return jsonb_build_object(
    'expected_role', 'service_role',
    'auth_jwt_role', coalesce(v_auth_role, '<blank>'),
    'auth_jwt_ref',  coalesce(v_auth_ref, '<blank>'),
    'legacy_setting_role', coalesce(v_legacy_role, '<blank>'),
    'legacy_setting_ref',  coalesce(v_legacy_ref, '<blank>'),
    'current_user', current_user,
    'session_user', session_user
  );
end;
$$;

revoke all on function public.debug_request_jwt_role_v1() from public;
grant execute on function public.debug_request_jwt_role_v1() to anon, authenticated, service_role;

-- 2) EvidenceReference persistence RPC: gate via auth.jwt role.
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
  in_payload_available boolean,
  in_fingerprint_contract_version text default null
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
  version_exists boolean;
  inserted_version boolean := false;
  replay boolean := false;
  computed text;
  v_role text;
begin
  v_role := nullif((auth.jwt() ->> 'role'), '');
  if v_role is distinct from 'service_role' then
    raise exception using errcode = '42501', message = 'unauthorized';
  end if;

  if in_evidence_reference_id is null or length(in_evidence_reference_id) = 0 then
    raise exception using errcode = 'P0001', message = 'invalid_argument';
  end if;
  if in_content_hash is null or length(in_content_hash) = 0 then
    raise exception using errcode = 'P0001', message = 'invalid_argument';
  end if;

  -- V2 hardening: DB computes V2 fingerprint; caller hash is assertion only.
  if in_fingerprint_contract_version = 'ei_fingerprint_v2' then
    computed := public.ei_compute_evidence_version_fingerprint_v2(in_payload_json);
    if computed is distinct from in_content_hash then
      raise exception using errcode = 'P0001', message = 'content_hash_mismatch';
    end if;
  end if;

  select * into existing
  from public.external_evidence_reference_versions_v1 ev
  where ev.evidence_reference_id = in_evidence_reference_id
    and ev.content_hash = in_content_hash;

  version_exists := found;

  if version_exists then
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
      and existing.fingerprint_contract_version is not distinct from in_fingerprint_contract_version
    ) then
      raise exception using errcode = 'P0001', message = 'integrity_conflict';
    end if;
    replay := true;
  else
    insert into public.external_evidence_reference_versions_v1(
      evidence_reference_id,
      content_hash,
      schema_version,
      source_id,
      source_config_version,
      legal_policy_version,
      policy_refs_json,
      payload_json,
      retention_policy,
      retention_expires_at,
      payload_available,
      effective_at,
      valid_from,
      valid_until,
      supersedes_content_hashes,
      legal_hold,
      access_revoked_at,
      content_redacted_at,
      redaction_reason,
      fingerprint_contract_version
    ) values (
      in_evidence_reference_id,
      in_content_hash,
      in_schema_version,
      in_source_id,
      in_source_config_version,
      in_legal_policy_version,
      in_policy_refs_json,
      in_payload_json,
      in_retention_policy,
      in_retention_expires_at,
      in_payload_available,
      in_effective_at,
      in_valid_from,
      in_valid_until,
      in_supersedes_content_hashes,
      in_legal_hold,
      in_access_revoked_at,
      in_content_redacted_at,
      in_redaction_reason,
      in_fingerprint_contract_version
    );

    inserted_version := true;

    insert into public.external_evidence_references_v1(evidence_reference_id)
    values (in_evidence_reference_id)
    on conflict (evidence_reference_id) do nothing;
  end if;

  return query
  select
    in_evidence_reference_id,
    in_content_hash,
    inserted_version,
    replay;
end;
$fn$;

revoke all on function persist_external_evidence_reference_v1(
  text,text,text,text,text,text,jsonb,timestamptz,timestamptz,timestamptz,jsonb,jsonb,text,timestamptz,boolean,timestamptz,timestamptz,text,boolean,text
) from public;
revoke all on function persist_external_evidence_reference_v1(
  text,text,text,text,text,text,jsonb,timestamptz,timestamptz,timestamptz,jsonb,jsonb,text,timestamptz,boolean,timestamptz,timestamptz,text,boolean
) from public;
revoke all on function persist_external_evidence_reference_v1(
  text,text,text,text,text,text,jsonb,timestamptz,timestamptz,timestamptz,jsonb,jsonb,text,timestamptz,boolean,timestamptz,timestamptz,text,boolean,text
) from anon, authenticated;

grant execute on function persist_external_evidence_reference_v1(
  text,text,text,text,text,text,jsonb,timestamptz,timestamptz,timestamptz,jsonb,jsonb,text,timestamptz,boolean,timestamptz,timestamptz,text,boolean,text
) to anon, authenticated, service_role;

grant execute on function persist_external_evidence_reference_v1(
  text,text,text,text,text,text,jsonb,timestamptz,timestamptz,timestamptz,jsonb,jsonb,text,timestamptz,boolean,timestamptz,timestamptz,text,boolean
) to anon, authenticated, service_role;

-- 3) Claim persistence RPC: gate via auth.jwt role.
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
  in_edge_policy_hash text,
  in_fingerprint_contract_version text default null
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
  computed text;
  v_role text;
begin
  v_role := nullif((auth.jwt() ->> 'role'), '');
  if v_role is distinct from 'service_role' then
    raise exception using errcode = '42501', message = 'unauthorized';
  end if;

  if in_claim_id is null or length(in_claim_id)=0 then
    raise exception using errcode = 'P0001', message = 'invalid_argument';
  end if;
  if in_content_hash is null or length(in_content_hash)=0 then
    raise exception using errcode = 'P0001', message = 'invalid_argument';
  end if;

  if in_fingerprint_contract_version = 'ei_fingerprint_v2' then
    computed := public.ei_compute_claim_version_content_hash_v2(in_payload_json);
    if computed is distinct from in_content_hash then
      raise exception using errcode = 'P0001', message = 'content_hash_mismatch';
    end if;
  end if;

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
      and existing.policy_refs_json is not distinct from in_policy_refs_json
      and existing.evidence_reference_id is not distinct from in_evidence_reference_id
      and existing.evidence_content_hash is not distinct from in_evidence_content_hash
      and existing.evidence_version_ref_json is not distinct from in_evidence_version_ref_json
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
      and existing.fingerprint_contract_version is not distinct from in_fingerprint_contract_version
    ) then
      raise exception using errcode = 'P0001', message = 'integrity_conflict';
    end if;
    replay := true;
  else
    select exists(
      select 1
      from public.external_evidence_reference_versions_v1 ev
      where ev.evidence_reference_id = in_evidence_reference_id
        and ev.content_hash = in_evidence_content_hash
    ) into evidence_ok;

    if evidence_ok is distinct from true then
      raise exception using errcode = 'P0001', message = 'linked_version_not_found';
    end if;

    insert into public.external_claim_versions_v1(
      claim_id,
      content_hash,
      schema_version,
      claim_fingerprint,
      interpretation_policy_version,
      interpretation_policy_hash,
      evidence_reference_id,
      evidence_content_hash,
      evidence_version_ref_json,
      policy_refs_json,
      payload_json,
      retention_policy,
      retention_expires_at,
      payload_available,
      effective_at,
      valid_from,
      valid_until,
      supersedes_content_hashes,
      legal_hold,
      access_revoked_at,
      content_redacted_at,
      redaction_reason,
      fingerprint_contract_version
    ) values (
      in_claim_id,
      in_content_hash,
      in_schema_version,
      in_claim_fingerprint,
      in_interpretation_policy_version,
      in_interpretation_policy_hash,
      in_evidence_reference_id,
      in_evidence_content_hash,
      in_evidence_version_ref_json,
      in_policy_refs_json,
      in_payload_json,
      in_retention_policy,
      in_retention_expires_at,
      in_payload_available,
      in_effective_at,
      in_valid_from,
      in_valid_until,
      in_supersedes_content_hashes,
      in_legal_hold,
      in_access_revoked_at,
      in_content_redacted_at,
      in_redaction_reason,
      in_fingerprint_contract_version
    );

    inserted_version := true;

    insert into public.external_claims_v1(claim_id)
    values (in_claim_id)
    on conflict (claim_id) do nothing;

    edge_id := encode(
      extensions.digest(
        (
          jsonb_build_object(
            'from_object_type','claim',
            'from_object_id',in_claim_id,
            'from_content_hash',in_content_hash,
            'to_object_type','evidence_reference',
            'to_object_id',in_evidence_reference_id,
            'to_content_hash',in_evidence_content_hash,
            'relation',in_edge_relation,
            'policy_version',in_edge_policy_version,
            'policy_hash',in_edge_policy_hash
          )::text
        )::bytea,
        'sha256'
      ),
      'hex'
    );

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
  end if;

  return query
  select
    in_claim_id,
    in_content_hash,
    inserted_version,
    replay;
end;
$fn$;

revoke all on function persist_external_claim_v1(
  text,text,text,text,text,text,text,text,jsonb,jsonb,timestamptz,timestamptz,timestamptz,jsonb,jsonb,text,timestamptz,boolean,timestamptz,timestamptz,text,boolean,text,text,text,text
) from public;
revoke all on function persist_external_claim_v1(
  text,text,text,text,text,text,text,text,jsonb,jsonb,timestamptz,timestamptz,timestamptz,jsonb,jsonb,text,timestamptz,boolean,timestamptz,timestamptz,text,boolean,text,text,text
) from public;
revoke all on function persist_external_claim_v1(
  text,text,text,text,text,text,text,text,jsonb,jsonb,timestamptz,timestamptz,timestamptz,jsonb,jsonb,text,timestamptz,boolean,timestamptz,timestamptz,text,boolean,text,text,text
) from anon, authenticated;

grant execute on function persist_external_claim_v1(
  text,text,text,text,text,text,text,text,jsonb,jsonb,timestamptz,timestamptz,timestamptz,jsonb,jsonb,text,timestamptz,boolean,timestamptz,timestamptz,text,boolean,text,text,text,text
) to anon, authenticated, service_role;

grant execute on function persist_external_claim_v1(
  text,text,text,text,text,text,text,text,jsonb,jsonb,timestamptz,timestamptz,timestamptz,jsonb,jsonb,text,timestamptz,boolean,timestamptz,timestamptz,text,boolean,text,text,text
) to anon, authenticated, service_role;
