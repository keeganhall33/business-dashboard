-- Milestone 12 execution boundary verification queries (sanitized)

-- Tables
select count(*) as execution_table_count
from information_schema.tables
where table_schema = 'public'
  and table_name in (
    'action_execution_requests_v1',
    'action_execution_confirmations_v1',
    'action_execution_attempts_v1',
    'action_execution_steps_v1',
    'action_execution_locks_v1',
    'action_execution_idempotency_v1',
    'action_execution_rollbacks_v1'
  );

-- RLS enabled count
select count(*) as rls_enabled_count
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in (
    'action_execution_requests_v1',
    'action_execution_confirmations_v1',
    'action_execution_attempts_v1',
    'action_execution_steps_v1',
    'action_execution_locks_v1',
    'action_execution_idempotency_v1',
    'action_execution_rollbacks_v1'
  )
  and c.relrowsecurity = true;

-- Triggers
select event_object_table, trigger_name
from information_schema.triggers
where trigger_name like 'action_execution_%_set_updated_at_v1'
order by event_object_table, trigger_name;

-- Indexes (sanitized list)
select tablename, indexname
from pg_indexes
where schemaname='public'
  and tablename like 'action_execution_%_v1'
order by tablename, indexname;

-- Constraint presence (check constraints only)
select conrelid::regclass as table_name, conname
from pg_constraint
where contype = 'c'
  and conrelid::regclass::text like 'action_execution_%_v1'
order by table_name, conname;
