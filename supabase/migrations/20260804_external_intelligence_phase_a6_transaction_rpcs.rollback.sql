-- Phase A6.1 rollback: Transactional Persistence RPC Foundation
-- WARNING: dropping functions may affect application behavior if deployed.

drop function if exists persist_external_signal_write_set_v1(
  text,text,text,text,
  text,text,text,text,text,text,text,
  jsonb,jsonb,jsonb,
  timestamptz,timestamptz,timestamptz,jsonb,
  jsonb,text,timestamptz,boolean,timestamptz,timestamptz,text,boolean,
  text,jsonb,
  jsonb,jsonb,
  text,integer,jsonb,
  jsonb
);

drop function if exists complete_external_processing_run_v1(text);

drop function if exists redact_external_signal_payload_v1(text,text,text);
drop function if exists redact_external_claim_payload_v1(text,text,text);
drop function if exists redact_external_evidence_payload_v1(text,text,text);

drop function if exists persist_external_claim_v1(
  text,text,text,text,text,text,text,text,jsonb,jsonb,
  timestamptz,timestamptz,timestamptz,jsonb,jsonb,
  text,timestamptz,boolean,timestamptz,timestamptz,text,boolean,
  text,text,text
);

drop function if exists persist_external_evidence_reference_v1(
  text,text,text,text,text,text,jsonb,
  timestamptz,timestamptz,timestamptz,jsonb,jsonb,
  text,timestamptz,boolean,timestamptz,timestamptz,text,boolean
);
