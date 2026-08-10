-- Fix: column reference "evidence_reference_id" is ambiguous in persist_external_evidence_reference_v1.
--
-- Root cause:
-- - The function RETURNS TABLE includes an output column named evidence_reference_id.
-- - In PL/pgSQL, unqualified identifiers can resolve to either a PL/pgSQL variable (incl. output column)
--   or a table column reference.
-- - The statement `on conflict (evidence_reference_id)` can become ambiguous at runtime.
--
-- Minimal fix:
-- - Avoid referencing the column name in ON CONFLICT target; use the named PK constraint instead.
-- - Preserve: auth gate (auth.jwt role), SECURITY DEFINER, signature, ordering, V2 behavior, grants, idempotency.

create or replace function public.persist_external_evidence_reference_v1(
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
as $function$
declare
  existing record;
  version_exists boolean;
  inserted_version boolean := false;
  replay boolean := false;
  computed text;
  v_role text;
begin
  -- Authorization: service_role caller only.
  v_role := coalesce(nullif((auth.jwt() ->> 'role'), ''), '');
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
    -- IMPORTANT: ensure parent exists BEFORE inserting the version row.
    insert into public.external_evidence_references_v1(evidence_reference_id)
    values (in_evidence_reference_id)
    on conflict on constraint external_evidence_references_v1_pkey do nothing;

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
  end if;

  return query
  select
    in_evidence_reference_id,
    in_content_hash,
    inserted_version,
    replay;
end;
$function$;

revoke all on function public.persist_external_evidence_reference_v1(
  text,text,text,text,text,text,jsonb,timestamptz,timestamptz,timestamptz,jsonb,jsonb,text,timestamptz,boolean,timestamptz,timestamptz,text,boolean,text
) from public;

grant execute on function public.persist_external_evidence_reference_v1(
  text,text,text,text,text,text,jsonb,timestamptz,timestamptz,timestamptz,jsonb,jsonb,text,timestamptz,boolean,timestamptz,timestamptz,text,boolean,text
) to anon, authenticated, service_role;
