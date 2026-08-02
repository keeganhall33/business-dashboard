-- Milestone 12: execution boundary persistence rollback
-- Safety:
-- - Drops only Milestone 12 objects
-- - Does not modify Milestone 11 tables

begin;

-- Drop triggers first
drop trigger if exists action_execution_requests_set_updated_at_v1 on action_execution_requests_v1;
drop trigger if exists action_execution_locks_set_updated_at_v1 on action_execution_locks_v1;
drop trigger if exists action_execution_idempotency_set_updated_at_v1 on action_execution_idempotency_v1;
drop trigger if exists action_execution_rollbacks_set_updated_at_v1 on action_execution_rollbacks_v1;

-- Drop tables in FK-safe order

drop table if exists action_execution_steps_v1;
drop table if exists action_execution_rollbacks_v1;
drop table if exists action_execution_attempts_v1;
drop table if exists action_execution_confirmations_v1;
drop table if exists action_execution_idempotency_v1;
drop table if exists action_execution_locks_v1;
drop table if exists action_execution_requests_v1;

-- Drop feature-owned function
drop function if exists action_execution_set_updated_at_v1;

commit;
