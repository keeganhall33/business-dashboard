# Outcome and Learning Architecture

This document defines how the intelligence engine becomes self-improving via measured outcomes.

## Purpose

Recommendations are not the end state. Every recommendation must eventually produce measurable learning.

## Learning loop (canonical)

Finding → Hypothesis → Recommendation → Action → Measured Outcome → Lesson → Updated Prior → Improved Future Recommendation

## Durable recommendation requirements

Every durable recommendation must support (fields may be null initially, but contracts must accommodate them):

- stable `recommendation_id`
- `recommendation_fingerprint`
- `action_key`
- `detector_id`
- `detector_version`
- `recommendation_policy_version`
- `metric_definition_versions`
- linked `finding_id`
- linked `hypothesis_ids`
- linked `opportunity_id`
- `evidence_window`
- `baseline_window`
- `evaluation_window`
- `result_window`
- `success_metrics`
- `success_threshold`
- `stop_condition`
- `execution_status`
- `execution_timestamp`
- `outcome` (success | failure | inconclusive)
- `confounders`
- `outcome_confidence`
- `lesson`
- `confidence_calibration_result`
- `regime_identifier`
- `learning_policy_version`

## Conservative learning rules

- Learning must be versioned, auditable, reversible.
- Must not overfit small samples.
- Must not learn only from wins.
- Must incorporate executed, ignored/dismissed, successful, failed, and inconclusive outcomes.
- May update explicit priors, pattern weights, ranking weights, and confidence calibration.
- Must not silently modify deterministic guardrails or production code.

## Regime detection (required)

Learning must be downweighted when the business enters a new regime (customer/channel/price/product shifts). Regime identifiers must be recorded alongside lessons.
