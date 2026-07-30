-- Rollback for 20260730_add_action_center_v1.sql (local/staging only)

drop trigger if exists trg_action_actions_updated_at on action_actions_v1;
drop trigger if exists trg_action_measurement_plans_updated_at on action_measurement_plans_v1;
drop trigger if exists trg_action_preferences_updated_at on action_preferences_v1;

drop table if exists action_synthetic_outcomes_v1;
drop table if exists action_preferences_v1;
drop table if exists action_comments_v1;
drop table if exists action_audit_events_v1;
drop table if exists action_measurement_plans_v1;
drop table if exists action_actions_v1;
drop table if exists action_evidence_snapshots_v1;

drop function if exists public.set_action_center_updated_at();
