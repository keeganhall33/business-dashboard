-- Forward migration: make Claim V2 content hashing deterministic/idempotent by excluding volatile retrieved_at.
--
-- Constraints:
-- - Do NOT rewrite historical rows.
-- - Claim stable ID semantics unchanged.
-- - Stored payload_json retains retrieved_at; we only remove it from the semantic content hash projection.

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

    -- IMPORTANT: retrieved_at is operational/provenance metadata; exclude from semantic content hash.

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
