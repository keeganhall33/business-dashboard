-- Phase 1 unblock: allow any execution_type strings.
-- The ingestion pipeline writes values like "operations", "pricing", "lifecycle", etc.
-- Earlier schema versions enforced a narrow enum via a check constraint.

alter table task_queue
  drop constraint if exists task_queue_execution_type_check;
