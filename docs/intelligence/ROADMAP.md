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
