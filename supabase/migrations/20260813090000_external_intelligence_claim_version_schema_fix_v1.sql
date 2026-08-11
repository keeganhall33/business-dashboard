-- Fix: persist_external_claim_v1 claim-version insert must match external_claim_versions_v1 schema.
--
-- Production error:
-- - "column evidence_reference_id of relation external_claim_versions_v1 does not exist"
--
-- Root cause:
-- - external_claim_versions_v1 stores evidence linkage in:
--   evidence_reference_version_ref_json (jsonb)
-- - persist_external_claim_v1 attempted to insert legacy columns:
--   evidence_reference_id, evidence_content_hash, evidence_version_ref_json
--
-- Scope (minimal):
-- - Update ONLY public.persist_external_claim_v1 to:
--   * insert evidence_reference_version_ref_json
--   * remove non-existent columns from INSERT and integrity comparisons
-- - Preserve: signature, SECURITY DEFINER, search_path, auth gate (auth.jwt role), V2 behavior,
--   provenance edge behavior, idempotency, grants, validations.

create or replace function public.persist_external_claim_v1(
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
as $function$
declare
  existing record;
  inserted_version boolean := false;
  replay boolean := false;
  evidence_ok boolean;
  edge_id text;
  computed text;
  v_role text;
begin
  -- Authorization: service_role caller only.
  v_role := coalesce(nullif((auth.jwt() ->> 'role'), ''), '');
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
      and existing.evidence_reference_version_ref_json is not distinct from in_evidence_version_ref_json
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
      evidence_reference_version_ref_json,
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
$function$;

revoke all on function public.persist_external_claim_v1(
  text,text,text,text,text,text,text,text,jsonb,jsonb,timestamptz,timestamptz,timestamptz,jsonb,jsonb,text,timestamptz,boolean,timestamptz,timestamptz,text,boolean,text,text,text,text
) from public;

grant execute on function public.persist_external_claim_v1(
  text,text,text,text,text,text,text,text,jsonb,jsonb,timestamptz,timestamptz,timestamptz,jsonb,jsonb,text,timestamptz,boolean,timestamptz,timestamptz,text,boolean,text,text,text,text
) to anon, authenticated, service_role;
