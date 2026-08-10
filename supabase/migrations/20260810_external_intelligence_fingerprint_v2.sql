-- External Intelligence: Fingerprint V2 contract (TS ↔ Postgres exact framing)
--
-- Scope:
-- - Add forward-only contract version pins on version rows (no backfill).
-- - Add deterministic bytea framing helpers and V2 hash calculators.
-- - Harden Evidence + Claim persistence RPCs: caller hashes are assertions only for V2.
--
-- IMPORTANT: Do NOT apply to production from this repo.

create extension if not exists pgcrypto;

-- =========================================================
-- 1) Forward schema support (no backfill)
-- =========================================================

alter table if exists public.external_evidence_reference_versions_v1
  add column if not exists fingerprint_contract_version text;

alter table if exists public.external_claim_versions_v1
  add column if not exists fingerprint_contract_version text;

-- =========================================================
-- 2) Deterministic V2 framing helpers
-- =========================================================

create or replace function public.ei_fp_v2_int32be(i integer)
returns bytea
language sql
immutable
as $$
  select
    set_byte(
      set_byte(
        set_byte(
          set_byte(E'\\000\\000\\000\\000'::bytea, 0, ((i >> 24) & 255)),
          1, ((i >> 16) & 255)
        ),
        2, ((i >> 8) & 255)
      ),
      3, (i & 255)
    );
$$;

create or replace function public.ei_fp_v2_encode_null()
returns bytea
language sql
immutable
as $$
  select decode('4e','hex') || public.ei_fp_v2_int32be(-1);
$$;

create or replace function public.ei_fp_v2_encode_string(s text)
returns bytea
language sql
immutable
as $$
  select
    decode('53','hex') ||
    public.ei_fp_v2_int32be(octet_length(convert_to(coalesce(s,''),'UTF8'))) ||
    convert_to(coalesce(s,''),'UTF8');
$$;

create or replace function public.ei_fp_v2_encode_string_array(in_values text[])
returns bytea
language plpgsql
immutable
as $$
declare
  out bytea := decode('41','hex') || public.ei_fp_v2_int32be(coalesce(array_length(in_values, 1), 0));
  v text;
begin
  if in_values is null then
    return decode('41','hex') || public.ei_fp_v2_int32be(0);
  end if;

  foreach v in array in_values loop
    out := out || public.ei_fp_v2_encode_string(v);
  end loop;

  return out;
end;
$$;

create or replace function public.ei_fp_v2_sha256_hex(b bytea)
returns text
language sql
immutable
as $$
  select encode(digest(b, 'sha256'), 'hex');
$$;

-- =========================================================
-- 3) V2 semantic hash calculators (DB-side authority)
-- =========================================================

create or replace function public.ei_compute_evidence_retained_payload_hash_v2(payload jsonb)
returns text
language plpgsql
immutable
as $$
declare
  lane text;
  jsonld_types text[];
  framed bytea;
begin
  if payload is null then
    raise exception using errcode='P0001', message='invalid_argument';
  end if;

  lane := payload->>'lane';
  if lane is null or length(lane)=0 then
    raise exception using errcode='P0001', message='invalid_argument';
  end if;

  if lane = 'structured_metadata' then
    select coalesce(array_agg(value order by ord), '{}'::text[])
      into jsonld_types
      from jsonb_array_elements_text(coalesce(payload->'jsonld_types','[]'::jsonb)) with ordinality as t(value, ord);

    framed :=
      public.ei_fp_v2_encode_string('ei_fingerprint_v2') ||
      public.ei_fp_v2_encode_string('evidence_retained_payload_v2') ||
      public.ei_fp_v2_encode_string(lane) ||
      public.ei_fp_v2_encode_string(payload->>'identity_url') ||
      public.ei_fp_v2_encode_string(payload->>'title') ||
      public.ei_fp_v2_encode_string(payload->>'meta_description') ||
      (case when payload ? 'og_site_name' and payload->>'og_site_name' is null then public.ei_fp_v2_encode_null()
            when payload->>'og_site_name' is null then public.ei_fp_v2_encode_null()
            else public.ei_fp_v2_encode_string(payload->>'og_site_name') end) ||
      public.ei_fp_v2_encode_string(payload->>'og_title') ||
      public.ei_fp_v2_encode_string_array(jsonld_types);

    return public.ei_fp_v2_sha256_hex(framed);
  end if;

  if lane = 'quote_only' then
    framed :=
      public.ei_fp_v2_encode_string('ei_fingerprint_v2') ||
      public.ei_fp_v2_encode_string('evidence_retained_payload_v2') ||
      public.ei_fp_v2_encode_string(lane) ||
      public.ei_fp_v2_encode_string(payload->>'source_url') ||
      public.ei_fp_v2_encode_string(payload->>'quote_text') ||
      (case when payload->>'quote_context' is null then public.ei_fp_v2_encode_null() else public.ei_fp_v2_encode_string(payload->>'quote_context') end) ||
      (case when payload->>'title' is null then public.ei_fp_v2_encode_null() else public.ei_fp_v2_encode_string(payload->>'title') end);

    return public.ei_fp_v2_sha256_hex(framed);
  end if;

  if lane = 'link_only' then
    framed :=
      public.ei_fp_v2_encode_string('ei_fingerprint_v2') ||
      public.ei_fp_v2_encode_string('evidence_retained_payload_v2') ||
      public.ei_fp_v2_encode_string(lane) ||
      public.ei_fp_v2_encode_string(payload->>'source_url') ||
      public.ei_fp_v2_encode_string(payload->>'title') ||
      (case when payload->>'summary' is null then public.ei_fp_v2_encode_null() else public.ei_fp_v2_encode_string(payload->>'summary') end);

    return public.ei_fp_v2_sha256_hex(framed);
  end if;

  raise exception using errcode='P0001', message='invalid_argument';
end;
$$;

create or replace function public.ei_compute_evidence_version_fingerprint_v2(payload jsonb)
returns text
language plpgsql
immutable
as $$
declare
  retained jsonb;
  retained_hash text;
  corroborating text[];
  contradicting text[];
  framed bytea;
begin
  if payload is null then
    raise exception using errcode='P0001', message='invalid_argument';
  end if;

  retained := payload->'retained_payload';
  retained_hash := public.ei_compute_evidence_retained_payload_hash_v2(retained);

  select coalesce(array_agg(value order by ord), '{}'::text[])
    into corroborating
    from jsonb_array_elements_text(coalesce(payload->'corroborating_evidence_reference_ids','[]'::jsonb)) with ordinality as t(value, ord);

  select coalesce(array_agg(value order by ord), '{}'::text[])
    into contradicting
    from jsonb_array_elements_text(coalesce(payload->'contradicting_evidence_reference_ids','[]'::jsonb)) with ordinality as t(value, ord);

  framed :=
    public.ei_fp_v2_encode_string('ei_fingerprint_v2') ||
    public.ei_fp_v2_encode_string('evidence_version_fingerprint_v2') ||
    public.ei_fp_v2_encode_string(payload->>'schema_version') ||
    public.ei_fp_v2_encode_string(payload->>'source_id') ||
    public.ei_fp_v2_encode_string(payload->>'source_config_version') ||
    public.ei_fp_v2_encode_string(payload->>'legal_policy_version') ||

    public.ei_fp_v2_encode_string(payload->>'evidence_type') ||
    public.ei_fp_v2_encode_string(payload->>'access_classification') ||
    public.ei_fp_v2_encode_string(payload->>'retention_policy') ||

    (case when payload->>'source_set_id' is null then public.ei_fp_v2_encode_null() else public.ei_fp_v2_encode_string(payload->>'source_set_id') end) ||
    (case when payload->>'source_artifact_identifier' is null then public.ei_fp_v2_encode_null() else public.ei_fp_v2_encode_string(payload->>'source_artifact_identifier') end) ||
    public.ei_fp_v2_encode_string(payload->>'source_url_or_reference') ||

    (case when payload->>'published_at' is null then public.ei_fp_v2_encode_null() else public.ei_fp_v2_encode_string(payload->>'published_at') end) ||
    (case when payload->>'event_time' is null then public.ei_fp_v2_encode_null() else public.ei_fp_v2_encode_string(payload->>'event_time') end) ||

    (case when payload->>'excerpt_or_summary_reference' is null then public.ei_fp_v2_encode_null() else public.ei_fp_v2_encode_string(payload->>'excerpt_or_summary_reference') end) ||
    public.ei_fp_v2_encode_string(payload->>'source_credibility_prior') ||

    public.ei_fp_v2_encode_string(payload->>'correction_status') ||
    public.ei_fp_v2_encode_string(payload->>'retraction_status') ||
    (case when payload->>'supersedes_evidence_reference_id' is null then public.ei_fp_v2_encode_null() else public.ei_fp_v2_encode_string(payload->>'supersedes_evidence_reference_id') end) ||

    public.ei_fp_v2_encode_string_array(corroborating) ||
    public.ei_fp_v2_encode_string_array(contradicting) ||

    public.ei_fp_v2_encode_string(retained_hash);

  return public.ei_fp_v2_sha256_hex(framed);
end;
$$;

create or replace function public.ei_compute_claim_version_content_hash_v2(payload jsonb)
returns text
language plpgsql
immutable
as $$
declare
  subject_entity_id text;
  object_kind text;
  object_entity_id text;
  object_literal_value text;
  object_literal_unit text;
  object_literal_value_type text;
  object_literal_language text;
  extraction_reasons text[];
  framed bytea;
begin
  if payload is null then
    raise exception using errcode='P0001', message='invalid_argument';
  end if;

  subject_entity_id := payload#>>'{subject,entity_id}';
  object_kind := payload#>>'{object,kind}';

  if object_kind = 'entity' then
    object_entity_id := payload#>>'{object,entity,entity_id}';
  else
    object_entity_id := null;
  end if;

  if object_kind = 'literal' then
    -- JSONB ->> returns text for string/number/boolean, and null for JSON null.
    object_literal_value := payload#>>'{object,value}';
    object_literal_unit := payload#>>'{object,unit}';
    object_literal_value_type := payload#>>'{object,value_type}';
    object_literal_language := payload#>>'{object,language}';
  else
    object_literal_value := null;
    object_literal_unit := null;
    object_literal_value_type := null;
    object_literal_language := null;
  end if;

  select coalesce(array_agg(value order by ord), '{}'::text[])
    into extraction_reasons
    from jsonb_array_elements_text(coalesce(payload#>'{extraction_confidence,reasons}','[]'::jsonb)) with ordinality as t(value, ord);

  framed :=
    public.ei_fp_v2_encode_string('ei_fingerprint_v2') ||
    public.ei_fp_v2_encode_string('claim_version_content_hash_v2') ||
    public.ei_fp_v2_encode_string(payload->>'claim_id') ||
    public.ei_fp_v2_encode_string(payload->>'claim_fingerprint') ||
    public.ei_fp_v2_encode_string(payload->>'evidence_reference_id') ||
    (case when subject_entity_id is null then public.ei_fp_v2_encode_null() else public.ei_fp_v2_encode_string(subject_entity_id) end) ||
    public.ei_fp_v2_encode_string(payload->>'predicate') ||

    public.ei_fp_v2_encode_string(object_kind) ||
    (case when object_entity_id is null then public.ei_fp_v2_encode_null() else public.ei_fp_v2_encode_string(object_entity_id) end) ||
    (case when object_literal_value is null then public.ei_fp_v2_encode_null() else public.ei_fp_v2_encode_string(object_literal_value) end) ||
    (case when object_literal_unit is null then public.ei_fp_v2_encode_null() else public.ei_fp_v2_encode_string(object_literal_unit) end) ||
    (case when object_literal_value_type is null then public.ei_fp_v2_encode_null() else public.ei_fp_v2_encode_string(object_literal_value_type) end) ||
    (case when object_literal_language is null then public.ei_fp_v2_encode_null() else public.ei_fp_v2_encode_string(object_literal_language) end) ||

    (case when payload->>'event_time' is null then public.ei_fp_v2_encode_null() else public.ei_fp_v2_encode_string(payload->>'event_time') end) ||
    (case when payload->>'announcement_time' is null then public.ei_fp_v2_encode_null() else public.ei_fp_v2_encode_string(payload->>'announcement_time') end) ||
    public.ei_fp_v2_encode_string(payload->>'retrieved_at') ||

    public.ei_fp_v2_encode_string(payload->>'observed_vs_inferred') ||
    public.ei_fp_v2_encode_string(payload->>'verification_state') ||

    public.ei_fp_v2_encode_string(payload#>>'{extraction_confidence,level}') ||
    public.ei_fp_v2_encode_string_array(extraction_reasons) ||

    public.ei_fp_v2_encode_string(payload->>'contradiction_state') ||
    public.ei_fp_v2_encode_string(payload->>'correction_state') ||

    (case when payload#>>'{relevance_window,start}' is null then public.ei_fp_v2_encode_null() else public.ei_fp_v2_encode_string(payload#>>'{relevance_window,start}') end) ||
    (case when payload#>>'{relevance_window,end}' is null then public.ei_fp_v2_encode_null() else public.ei_fp_v2_encode_string(payload#>>'{relevance_window,end}') end) ||

    public.ei_fp_v2_encode_string(payload->>'schema_version') ||
    public.ei_fp_v2_encode_string(payload->>'interpretation_policy_version');

  return public.ei_fp_v2_sha256_hex(framed);
end;
$$;

-- =========================================================
-- 4) RPC hardening (V2 only)
-- =========================================================

-- Avoid function overload ambiguity: replace the Phase A6 signatures with V2-capable versions.
drop function if exists public.persist_external_evidence_reference_v1(
  text,text,text,text,text,text,jsonb,
  timestamptz,timestamptz,timestamptz,jsonb,jsonb,
  text,timestamptz,boolean,timestamptz,timestamptz,text,boolean
);

drop function if exists public.persist_external_claim_v1(
  text,text,text,text,text,text,
  text,text,jsonb,jsonb,
  timestamptz,timestamptz,timestamptz,jsonb,
  jsonb,
  text,timestamptz,boolean,timestamptz,timestamptz,text,boolean,
  text,text,text
);

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
begin
  if session_user is distinct from 'service_role' then
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
      payload_available,
      fingerprint_contract_version
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
      in_payload_available,
      in_fingerprint_contract_version
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

revoke all on function persist_external_evidence_reference_v1(
  text,text,text,text,text,text,jsonb,
  timestamptz,timestamptz,timestamptz,jsonb,jsonb,
  text,timestamptz,boolean,timestamptz,timestamptz,text,boolean,
  text
) from public;
revoke all on function persist_external_evidence_reference_v1(
  text,text,text,text,text,text,jsonb,
  timestamptz,timestamptz,timestamptz,jsonb,jsonb,
  text,timestamptz,boolean,timestamptz,timestamptz,text,boolean,
  text
) from anon;
revoke all on function persist_external_evidence_reference_v1(
  text,text,text,text,text,text,jsonb,
  timestamptz,timestamptz,timestamptz,jsonb,jsonb,
  text,timestamptz,boolean,timestamptz,timestamptz,text,boolean,
  text
) from authenticated;
grant execute on function persist_external_evidence_reference_v1(
  text,text,text,text,text,text,jsonb,
  timestamptz,timestamptz,timestamptz,jsonb,jsonb,
  text,timestamptz,boolean,timestamptz,timestamptz,text,boolean,
  text
) to service_role;

-- Claim RPC: add optional V2 contract pin + hash validation.
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
begin
  if session_user is distinct from 'service_role' then
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
      raise exception using errcode='P0001', message='content_hash_mismatch';
    end if;
  end if;

  -- Validate pinned evidence version exists.
  select true into evidence_ok
  from public.external_evidence_reference_versions_v1 ev
  where ev.evidence_reference_id = in_evidence_reference_id
    and ev.content_hash = in_evidence_content_hash;

  if not found then
    raise exception using errcode = 'P0001', message = 'linked_version_not_found';
  end if;

  -- Validate VersionRef JSON agrees with normalized pins.
  if (in_evidence_version_ref_json->>'object_type') is distinct from 'evidence_reference'
     or (in_evidence_version_ref_json->>'object_id') is distinct from in_evidence_reference_id
     or (in_evidence_version_ref_json->>'content_hash') is distinct from in_evidence_content_hash then
    raise exception using errcode = 'P0001', message = 'object_type_mismatch';
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
      and existing.fingerprint_contract_version is not distinct from in_fingerprint_contract_version
    ) then
      raise exception using errcode='P0001', message='integrity_conflict';
    end if;
    replay := true;
  else
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
    ) on conflict on constraint external_claims_v1_pkey do nothing;

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
      payload_available,
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
      in_payload_available,
      in_fingerprint_contract_version
    );

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

    inserted_version := true;
  end if;

  update public.external_claims_v1 cs
    set current_content_hash = in_content_hash
  where cs.claim_id = in_claim_id;

  claim_id := in_claim_id;
  content_hash := in_content_hash;
  created_new_version := inserted_version;
  idempotent_replay := replay;
  return next;
end;
$fn$;

revoke all on function persist_external_claim_v1(
  text,text,text,text,text,text,
  text,text,jsonb,jsonb,
  timestamptz,timestamptz,timestamptz,jsonb,
  jsonb,
  text,timestamptz,boolean,timestamptz,timestamptz,text,boolean,
  text,text,text,
  text
) from public;
revoke all on function persist_external_claim_v1(
  text,text,text,text,text,text,
  text,text,jsonb,jsonb,
  timestamptz,timestamptz,timestamptz,jsonb,
  jsonb,
  text,timestamptz,boolean,timestamptz,timestamptz,text,boolean,
  text,text,text,
  text
) from anon;
revoke all on function persist_external_claim_v1(
  text,text,text,text,text,text,
  text,text,jsonb,jsonb,
  timestamptz,timestamptz,timestamptz,jsonb,
  jsonb,
  text,timestamptz,boolean,timestamptz,timestamptz,text,boolean,
  text,text,text,
  text
) from authenticated;
grant execute on function persist_external_claim_v1(
  text,text,text,text,text,text,
  text,text,jsonb,jsonb,
  timestamptz,timestamptz,timestamptz,jsonb,
  jsonb,
  text,timestamptz,boolean,timestamptz,timestamptz,text,boolean,
  text,text,text,
  text
) to service_role;
