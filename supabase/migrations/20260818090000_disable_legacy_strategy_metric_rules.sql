-- Retire the original metric-threshold strategy automation.
--
-- These rules were created before Career OS + Fusion + Avery became the canonical
-- operating-decision path. A metric threshold may be evidence of a problem, but
-- it must not directly prescribe a strategic task outside that decision flow.
--
-- Keep the table and historical rows for audit/reproducibility; disable execution.

update metric_alert_rules
set is_active = false
where is_active = true;
