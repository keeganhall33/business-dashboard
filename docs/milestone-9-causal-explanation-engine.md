# Milestone 9 — Causal Explanation Engine (Read-only)

This document preserves the **sanitized** evidence that Milestone 9 delivered an evidence-backed, read-only causal explanation engine.

No secrets, credentials, raw tokens, or PII are included.

## Explanation contract

Implemented in:
- `src/lib/intelligence/explanation-contract.ts`

Each explanation includes (selected):
- `metric`, `current_period`, `comparison_period`
- `absolute_change`, `percentage_change`, `baseline`
- `primary_driver`, `contributing_drivers`, `counteracting_drivers`
- `alternative_explanations` (competing hypotheses)
- `confidence` + `confidence_reasons`
- `data_used`, `data_missing`, `assumptions`, `limitations`
- `recommended_follow_up`
- `evidence` (structured items)

Confidence levels:
- `confirmed`
- `strongly_supported`
- `likely`
- `possible`
- `insufficient_evidence`

Guardrail: `confirmed` is not used unless evidence directly establishes the relationship.

## Sources used

Read-only sources used by the engine:
- Woo selected-range telemetry (revenue truth)
- GA4 aggregate telemetry (sessions proxy when available)
- Meta summary signals (explicitly not treated as incremental causation without matchback)

Known limitations preserved:
- Email not connected
- Meta↔Woo matchback not implemented
- UTM/campaign taxonomy not standardized
- Identity resolution not implemented

## Engine modules

- `src/lib/intelligence/metric-decomposition.ts` (Revenue = Sessions × Conversion × AOV)
- `src/lib/intelligence/anomaly-detection.ts` (outlier detection; no silent removal)
- `src/lib/intelligence/evidence-timeline.ts` (normalized timeline of available evidence)
- `src/lib/intelligence/explanation-engine.ts` (driver ranking + competing hypotheses + confidence logic)

## API

- `GET /api/intelligence/explain`
  - returns structured JSON (`ExplainResponse`)
  - no secrets or raw PII
  - read-only

## Live scenarios tested

Machine-readable artifacts (untracked):
- `.artifacts/milestone-9-causal-explanations/`

Scenarios include:
- revenue increase (selected range with positive delta)
- revenue decrease (selected range with negative delta)
- outlier-distorted window
- DST-spanning range
- insufficient-evidence (all-zero / future window)

## Confidence behavior

Confidence is degraded when:
- key telemetry is missing (e.g., GA4 sessions)
- sample sizes are small
- outliers are detected without order-level classification
- both periods are all-zero for revenue/orders/sessions → `insufficient_evidence` with no primary driver

## Missing-data behavior

The engine explicitly reports:
- unavailable sources (email, matchback)
- assumptions and limitations
- alternative hypotheses that remain plausible

It does not fabricate external events.

## Playwright results

Live UI proof (untracked artifacts):
- `.artifacts/milestone-9-causal-explanations/playwright-report.json`

Projects:
- desktop Chromium
- mobile Chromium
- mobile WebKit

## Known limitations (unchanged)

- Cross-channel causality remains correlation-limited without matchback + taxonomy.
- No email telemetry → lifecycle explanations are not claimable.
- No identity resolution → person-level conclusions are prohibited.

## Artifact directory reference

All proof artifacts are intentionally untracked:
- `.artifacts/milestone-9-causal-explanations/`
