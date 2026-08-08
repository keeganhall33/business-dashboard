-- Rollback: unregister intelligence-traffic-quality scheduled job

delete from scheduled_jobs where job_key = 'intelligence-traffic-quality';

