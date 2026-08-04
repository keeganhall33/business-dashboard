-- Phase A5 rollback: External Intelligence Database Foundation
-- WARNING: dropping tables is destructive once data exists. In production, prefer disabling writers first.

drop table if exists external_processing_runs_v1;
drop table if exists external_source_contributions_v1;
drop table if exists external_corrections_v1;
drop table if exists external_lifecycle_transitions_v1;
drop table if exists external_provenance_edges_v1;
drop table if exists external_signal_versions_v1;
drop table if exists external_signals_v1;
drop table if exists external_claim_versions_v1;
drop table if exists external_claims_v1;
drop table if exists external_evidence_reference_versions_v1;
drop table if exists external_evidence_references_v1;
