-- Rollback: unregister fusion-daily-decision-v1 scheduled job

delete from scheduled_jobs where job_key = 'fusion-daily-decision-v1';

