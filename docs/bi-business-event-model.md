# Unified Business Event + Knowledge Model (v1)

This markdown file is a human-readable companion to:
- `docs/bi-business-event-model.json`
- `docs/bi-source-event-mappings.json`
- `docs/bi-event-model-examples.json`

## Purpose

Create a canonical, append-only business event timeline that can:
- answer **What happened?**
- support **Why did it happen?** (evidence-ranked explanations)
- produce **What should Keegan do now?** (ranked recommendations)
- prepare **execution-ready actions** with approval gating
- measure outcomes and learn

## Model boundaries (non-negotiable)

- Do not claim causation from proximity.
- Keep **Woo exact** revenue separate from platform-reported revenue.
- All explanations/recommendations must carry confidence + provenance.

## Core shapes

### BusinessEvent

A single canonical row representing an observed or derived event.

Key fields:
- identity: `event_id`, `source_system`, `source_record_id`, `source_record_ref`
- time: `occurred_at`, `recorded_at`
- meaning: `event_type`, `channel`
- joins: `campaign_id`, `product_id`, `artwork_id`, `customer_id`, `order_id`, etc.
- quantities: cost/revenue/reach/impressions/clicks/sessions/leads/orders
- attribution: `attribution_window`, `attribution_role`, and selected attribution model (reporting)
- quality: `confidence`, `confidence_reason`, `freshness_as_of`, `coverage_start/end`, `completeness`, `definition_version`

### Knowledge model

Separate:
- verified facts
- business rules
- learned patterns
- hypotheses
- user preferences
- operational constraints

Each record requires provenance, confidence, effective dates, and override history.

## Implementation direction (discovery only)

Recommended storage:
- `business_events_v1` append-only
- entity dimension tables (`entities_products_v1`, etc.)
- action system tables (`recommendations_v1`, `prepared_actions_v1`, `approvals_v1`, `executions_v1`, `outcomes_v1`)

No production schema changes in this milestone.
