-- Phase A6: allow bounded excerpt retention labels for governed external evidence.
--
-- Purpose: introduce quote_only / summary_only / licensed_fulltext as explicit retention_policy values
-- for external_evidence_reference_versions_v1.
--
-- This is required to avoid mislabeling body-text excerpts as link_only.
--
-- Safety:
-- - No data migration.
-- - No row updates.
-- - Only expands the check constraint.

alter table public.external_evidence_reference_versions_v1
  drop constraint if exists external_evidence_reference_versions_v1_retention_policy_check;

alter table public.external_evidence_reference_versions_v1
  add constraint external_evidence_reference_versions_v1_retention_policy_check
  check (retention_policy in ('retain','link_only','quote_only','summary_only','licensed_fulltext','tombstone'));
