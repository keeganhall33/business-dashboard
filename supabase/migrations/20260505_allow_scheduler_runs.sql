-- Allow scheduler-triggered system runs
alter table if exists system_runs
  drop constraint if exists system_runs_run_type_check;
alter table if exists system_runs
  add constraint system_runs_run_type_check
  check (run_type in ('manual','weekly','rule_evaluation','scheduler'));
