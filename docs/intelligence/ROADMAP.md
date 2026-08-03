# AI Chief Strategy Officer — Roadmap (North Star)

This roadmap is the governing plan for building an autonomous AI business decision engine.

**Core constraint:** The framework exists only to enable the AI to discover valuable opportunities you would likely never notice by reviewing individual sources.

**Non‑negotiable architecture chain:**

Facts → Findings → Hypotheses → Opportunities → Recommendations → Actions → Outcomes → Lessons → Updated Priors

## Permanent pillars (must not be dropped)

### A) Internal Business Intelligence Foundation
- Unified Business Fact Model (UBFM)
- Metric Dictionary (versioned definitions)
- Findings (anomalies + relationships)
- Hypotheses (competing, falsifiable)
- Opportunities (cross‑channel)
- Recommendations (one primary action; measurable)
- Confidence + Evidence Graph (supporting + contradicting evidence; missing evidence)

### B) External Intelligence Foundation
Internal data alone is not the final system.

- External Intelligence Layer
- External Signal Fact Model
- Entity + Relationship Graph
- Strategic Opportunity Fusion Engine (internal evidence + external context)
- Competitive Intelligence Engine (see `docs/intelligence/EXTERNAL_INTELLIGENCE_ARCHITECTURE.md`)

- External evidence rules:
  - source, source type, source reference, retrieved_at
  - event time + relevance window + expiration
  - credibility scoring + corroboration + contradiction tracking
  - classification: verified_event | market_observation | trend_signal | forecast | opinion | rumor | hypothesis
  - mechanism-linked to business relevance
  - rumor/opinion may generate questions/hypotheses, **not** operating recommendations
- Canonical categories (see `docs/intelligence/EXTERNAL_INTELLIGENCE_ARCHITECTURE.md`):
  - sports, music, entertainment/culture, art/collector markets, search/social, commercial/competitive,
    economic/consumer, platform/regulatory
  - additions: licensing/IP, collector liquidity, shipping/fulfillment disruptions

### C) Outcome and Learning Foundation
Recommendation output alone is not the final system.

Every recommendation must ultimately produce measurable learning.

- Recommendation execution tracking (executed/ignored/dismissed)
- Outcome measurement (success/failure/inconclusive)
- Lessons (what worked and why)
- Confidence calibration
- Detector usefulness (which patterns matter)
- Action effectiveness priors (what works under which conditions)
- Recommendation-policy versioning
- Regime detection (downweight outdated lessons)
- Learning constraints:
  - versioned, auditable, reversible
  - statistically conservative (no small-sample overfitting)
  - must not learn only from wins
  - may update explicit priors/weights/ranking/calibration
  - must never silently rewrite deterministic guardrails or production code

### D) Predictive and Strategic Intelligence
- Lag-aware influence detection
- Emerging risk detection
- Pattern memory ("this resembles…")
- Scenario reasoning
- Customer cohort intelligence
- Product/subject strategy intelligence
- "What not to do" recommendations
- Assumption-challenge behavior

## Phases (12–18 months)

### Phase 1 — Immediate intelligence
Minimum viable UBFM + one cross-channel detector vertical slice with persisted chain and auditability.

### Phase 2 — Cross-channel intelligence
Expand dimensions + lag-aware relationships; improve hypothesis competition and missing-evidence targeting.

### Phase 3 — Learning intelligence
Outcome evaluation + conservative learning priors; recommendation effectiveness and confidence calibration.

### Phase 4 — Predictive intelligence
Emerging risks/opportunities; regime shift detection; conservative scenario forecasts.

### Phase 5 — Strategic intelligence
Entity/relationship graph mature; product/subject strategy; partnerships/licensing opportunities; assumption-challenge.
