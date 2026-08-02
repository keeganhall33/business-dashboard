# Milestone 10 — Recommendation & Opportunity Engine (Read-only)

Sanitized summary of the evidence-backed recommendation and opportunity engine.

No secrets, raw credentials, PII, or unsafe runtime artifacts are included.

## Recommendation contract

Implemented in:
- `src/lib/intelligence/recommendation-contract.ts`

Each recommendation includes:
- identity (`id`, `title`, `category`)
- recommended action + reason
- supporting evidence (structured)
- affected products/channels/audiences
- expected outcome
- conservative expected-impact range (low / expected / high)
- effort, cost, time-to-impact
- confidence + reasons
- urgency, risk, downside
- prerequisites + execution steps
- prepared draft assets (watermarked `DRAFT_NOT_APPROVED`)
- approval level (L0–L5 model; Milestone 10 limited to L0–L3)
- measurement plan + thresholds
- lifecycle status

Categories supported include:
- scale, pause, refresh, retarget
- email, social, website, product
- pricing_experiment, bundle
- collector_outreach, lead_follow_up, abandoned_cart
- inventory, media, partnership
- measurement, data_connection
- do_nothing

## Opportunity types

Implemented in `src/lib/intelligence/opportunity-detection.ts` (initial subset):
- insufficient_evidence
- missing_data_connection (email)
- attribution_blind_spot (no matchback)
- high_traffic_low_conversion (conversion driver)
- bundle_opportunity (AOV driver)

The contract contains additional types for later activation as data sources mature.

## Priority scoring

Implemented in:
- `src/lib/intelligence/priority-scoring.ts`

Overall score (0–100):

`overallScore = 100 * (0.25*revenuePotential + 0.20*confidence + 0.12*urgency + 0.10*timeToImpact + 0.10*executionReadiness + 0.08*strategicFit + 0.05*effortInverse + 0.05*costInverse + 0.05*riskInverse)`

Each recommendation returns the factor breakdown plus the formula string.

## Guardrails

Implemented in:
- `src/lib/intelligence/recommendation-guardrails.ts`

Guardrails prevent:
- scaling spend when matchback is missing
- recommending email sends when email platform is not connected
- aggressive actions on tiny samples
- outlier-driven spikes being treated as repeatable baseline
- speculative actions when evidence is insufficient (routes to do_nothing / data_connection / measurement)

## Prepared-draft behavior

Implemented in:
- `src/lib/intelligence/action-preparation.ts`

Draft outputs are preparation-only and always marked:
- `DRAFT_NOT_APPROVED`

No external execution is enabled.

## Approval-level limits

Milestone 10 creates:
- L0_INSIGHT, L1_RECOMMENDATION, L2_DRAFT_PREPARED

It does not enable L4 or L5.

## APIs

Structured, read-only JSON APIs:
- `GET /api/intelligence/opportunities`
- `GET /api/intelligence/recommendations`

## Live scenarios + proof

Machine-readable artifacts (untracked):
- `.artifacts/milestone-10-recommendations/`

Includes scenario JSON files + Playwright report + screenshots:
- `playwright-report.json`
- representative screenshots of Opportunity Center, Recommendations, insufficient-evidence state, and mobile.

## Known limitations

- Email platform not connected.
- Meta↔Woo matchback not implemented.
- UTM taxonomy not standardized.
- Identity resolution not implemented.
- Recommendations are intentionally conservative and do not claim incremental causality.

## Artifact directory reference

All proof artifacts are intentionally untracked:
- `.artifacts/milestone-10-recommendations/`
