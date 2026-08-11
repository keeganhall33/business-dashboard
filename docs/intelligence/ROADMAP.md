# Intelligence Roadmap (Locked Direction)

This file records planned capabilities and non-overlapping parallel development streams.

## Parallel Streams

### STREAM A — CORE_INTELLIGENCE
Owns shared persistence + semantics:
- Evidence/Claim/Event/Signal semantics
- Intelligence graph + provenance
- Coverage model + research orchestration + research memory
- Opportunity qualification + buyer/function resolution + buyer intent
- Valuation + recommendation logic

Only Stream A may change shared graph schema/coverage semantics until stable interfaces are published.

### STREAM B — DISCOVERY_INTELLIGENCE
Owns discovery models + adapters/contracts/fixtures (no shared schema changes initially):
- Company Intelligence Search (discovery contracts, deterministic fixtures/tests)
- Event Intelligence + Global Recurring Event Intelligence
- Sponsor/activation ecosystems + company↔event traversal models
- Location+time discovery + planning-cycle intelligence models
- Source universe taxonomy + adapter interface contracts

### STREAM C — INTELLIGENCE_UX
Owns UI contracts + mock-driven prototypes (no binding to unstable backend):
- Intelligence Home
- Universal search
- Company Intelligence page
- Event Intelligence page
- Opportunity page
- Annual event pipeline/calendar
- Evidence/explainability UX

## Roadmap Capabilities

### COMPANY_INTELLIGENCE_SEARCH
- input any company/organization
- discover programs, partnerships, events, agencies, opportunities
- generate project concepts
- qualify/value
- identify buyer/functions/contacts

### EVENT_INTELLIGENCE
- input event
- sponsors, activations, hospitality, agencies
- VIP/HNW ecosystem
- opportunity generation

### LOCATION_TIME_INTELLIGENCE
- city/region + date window
- discover relevant event ecosystems

### GLOBAL_RECURRING_EVENT_INTELLIGENCE
- automatically discover/rank annual global events
- sports, entertainment, luxury, art/culture, business/corporate, philanthropy, hospitality
- US + international

### EVENT_OPPORTUNITY_SCORING
Include:
- prestige, commercial spend, sponsor density, VIP/HNW density
- creative activation density, Keegan project fit
- hospitality opportunity, partnership opportunity
- repeatability, accessibility
- timing/lead-time fit, strategic upside

### PLANNING_CYCLE_INTELLIGENCE
Track/infer with evidence+confidence:
- event date
- relationship-building window
- budget cycle
- agency appointment timing
- creative planning window
- procurement window
- production deadline
- ideal pitch window
- late/too-late state

Timing states:
- TOO_EARLY
- RELATIONSHIP_WINDOW
- IDEAL_PITCH_WINDOW
- ACTIVE_PROCUREMENT_WINDOW
- LATE_WINDOW
- TOO_LATE
- EVERGREEN

Forward horizons:
- 0–3 months
- 3–9 months
- 9–18 months
- 18–36 months

### MULTI_YEAR_EVENT_MEMORY
For recurring events retain:
- sponsors by year, agencies by year, activations
- contacts, outreach, outcomes
- timing, planning-cycle evidence
- previous concepts, reactivation triggers

### COMPANY_EVENT_GRAPH
Traversal both ways:
- Company → Events
- Event → Companies

## First-party email intelligence (planned)

### FIRST_PARTY_BUSINESS_MEMORY
- Extract first-party relationship + commercial facts from trusted sources (email, notes, internal docs)
- Preserve message/thread provenance
- Keep first-party facts distinct from external claims

### EMAIL_INTELLIGENCE
- Read-only mailbox ingestion (metadata-first triage)
- Business relevance classification + selective deep extraction
- Entity/person/company resolution + relationship graph augmentation

### DORMANT_OPPORTUNITY_RECOVERY
- Detect stalled follow-ups, "circle back" windows elapsed, proposal dormancy, and reactivation candidates
- Output: REACTIVATE | MONITOR | CLOSED | UNKNOWN (no outreach)

### RELATIONSHIP_REACTIVATION
- Combine first-party warm history with new external triggers to produce high-leverage reactivation tasks

### INSTITUTIONAL_MEMORY_SEARCH
- Answer: "Have I ever interacted with X?" and "What happened with Y?" across email + internal notes + opportunities

## SHARED_MULTI_INTERFACE_INTELLIGENCE (planned)

Goal: multiple compatible user interfaces over one authoritative intelligence + memory layer, so business context is not trapped in the interface where it was created.

### Interfaces
- ChatGPT: owner strategy, exploration, business judgment, new context, nuanced planning
- Dashboard (`mission.keeganhall.com`): live operational intelligence, recommendations, analytics, alerts, evidence, "what should I do next?" queries
- Jeeves/OpenClaw: execution, ingestion, research, automation, development, local operations

### Shared-memory principle
All interfaces should read from and, where policy allows, contribute structured deltas to the same durable business-memory/intelligence layer with source provenance.

Do not treat every conversational statement as authoritative truth. Classify captured deltas at minimum as:
- FACT
- IDEA
- HYPOTHESIS
- PREFERENCE
- DECISION
- ACTION
- OUTCOME

Preserve source, observed time, confidence, whether user-stated vs assistant-suggested vs system-inferred, and supersession/current-state relationships.

### CHATGPT_STRATEGIC_MEMORY
- One-time controlled historical backfill of business-relevant ChatGPT history as a seed, not the permanent runtime model
- Extract decisions, relationship history, experiments, pricing history, strategies, outcomes, lessons, preferences, and superseded thinking
- Preserve raw-source provenance where available
- Incremental delta capture for new relevant conversations so memory evolves continuously
- Do not repeatedly reprocess the entire conversation archive
- Separate historical consideration from current belief/current strategy

### DASHBOARD_CONVERSATIONAL_INTELLIGENCE
- Allow natural-language questions directly in the dashboard against the same intelligence graph
- Support evidence-backed questions such as "What should I do today?", "Why are print sales down?", "Which opportunities deserve attention?", and "Have I interacted with this company before?"
- Dashboard conversation should not become a separate isolated memory silo

### CROSS_INTERFACE_COMPATIBILITY
A business fact, decision, action, or outcome captured through one interface should be retrievable from the others once ingested and authorized. Interface-specific presentation may differ, but underlying evidence and current business state should remain shared.

## RECOMMENDATION_OUTCOME_LEARNING_LOOP (planned)

Goal: automatically determine whether intelligence recommendations produce meaningful business outcomes and use those results to improve future recommendations.

For each recommendation persist where applicable:
- recommendation + rationale + evidence snapshot
- confidence
- predicted outcome/range
- target metrics
- evaluation window(s)
- whether/when action was actually taken
- pre-action baseline
- post-action measurements
- observed outcome
- prediction accuracy
- attribution confidence
- lesson / calibration update

Evaluation windows should be recommendation-specific (for example 7/14/30 days for ads; longer windows for relationship and partnership opportunities).

Outcome families include:
- financial: revenue, margin, AOV, LTV, original/print/project revenue
- marketing: ROAS, CAC, conversion, funnel performance
- audience: followers, reach, engagement, list growth, audience quality
- relationships: responses, meetings, introductions, reactivation, stage advancement
- creative: subject/product performance, time-to-create, revenue per creation hour
- strategic: press, collector quality, brand partnerships, institutional access, prestige

Never infer causation solely from temporal correlation. Keep observed outcome, action effectiveness, and attribution confidence distinct.

## COST_AND_EFFICIENCY_OBSERVABILITY (planned)

Track development and operating economics so the system can be optimized for cost per correct/useful milestone and business value, not minimum token count.

Capture when available:
- model/provider
- input/output token usage
- estimated model cost
- external data/API cost
- task duration
- retries/rework
- review outcome
- infrastructure cost
- data-source cost
- downstream business value/outcome when measurable

Use this to improve model routing, identify low-value data providers, reduce repeated processing, and keep parallel-agent development within explicit cost/concurrency caps.

## AGENT_ORCHESTRATION (planned)

Goal: eliminate Keegan as manual copy/paste relay between architect/reviewer and Jeeves.

Target flow:
Keegan (sets goals/approves consequences)
→ Architect/Reviewer (creates bounded task + review)
→ Jeeves (executes)
→ Architect/Reviewer (approve/request changes)

Design constraints:
- durable task state + audit history
- bounded autonomous review iterations
- human-approval gates for credentials/outreach/production writes
- structured machine-readable result contract

## VISUAL_INTELLIGENCE_UX (Hard Product Requirement)

The dashboard must be:
- visual-first
- clean
- premium
- modern
- easy to scan
- low cognitive load
- decision-first
- progressive disclosure
- evidence-backed
- responsive

Avoid text-wall dashboards and meaningless chart density.

### Information hierarchy
- Level 1: Decision / recommendation / alert
- Level 2: Visual explanation
- Level 3: Detailed reasoning
- Level 4: Source evidence / raw records

### Planned visual components
- OPPORTUNITY_MATRIX (fit/probability vs value; timing/actionability state)
- PLANNING_TIMELINE (relationship window → pitch → procurement → production → event)
- RELATIONSHIP_GRAPH (Keegan → intermediary → company/person)
- COMPANY_EVENT_ECOSYSTEM_GRAPH (company ↔ event ↔ sponsor ↔ agency ↔ activation)
- EXECUTIVE_ACTION_BOARD (DO NOW / MONITOR / WAIT / DEPRIORITIZE)
- GLOBAL_EVENT_CALENDAR (multi-year planning windows)
- BUSINESS_HEALTH_VISUALS (revenue, conversion, traffic, ads, product momentum, collector momentum)
- PRODUCT_PORTFOLIO_MAP
- COLLECTOR_FUNNEL
- GEOGRAPHIC_OPPORTUNITY_MAP
- VALUE_RANGE / CONFIDENCE visualization
- EVIDENCE_STRENGTH visualization

### Visualization principle
Every visualization must answer a decision question.

Examples:
- line chart: what changed over time?
- funnel: where is value leaking?
- scatter/bubble: what deserves priority?
- timeline: when should Keegan act?
- relationship graph: how can Keegan reach the buyer?
- map: where is opportunity concentrated?
- calendar: what planning windows are approaching?

No chart without a decision purpose.

## Outcome Goal
Optimize for:
> “What actions taken today maximize Keegan's probability of securing the highest-value future projects?”

Not merely:
> “What can Keegan pitch today?”

## Principles (Recorded)

### Whitespace rule
Absence of prior art/artist precedent is **not negative evidence by itself**.

Future assessment must distinguish:
- `CREATIVE_PRECEDENT`: recurring | multiple | isolated | none_found | unknown
- `ART_WHITESPACE_POTENTIAL`: high | medium | low | unknown
- `ADOPTION_FRICTION`: high | medium | low | unknown

### Commercial framing & value translation
Buyer unfamiliarity with premium art pricing must **not** automatically reduce estimated project value.

Instead determine the best buyer budget/value frame:
- sponsorship activation
- experiential
- VIP hospitality
- corporate gifting
- licensing
- content
- client entertainment
- donor relations
- design/property
- other evidenced budget context

Track:
- `VALUE_EDUCATION_BURDEN`
- `BUDGET_FRAME_COMPATIBILITY`
- `VALUE_TRANSLATION_STRENGTH`
- `PRICE_SHOCK_RISK`
