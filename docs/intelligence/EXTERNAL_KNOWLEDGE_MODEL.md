# External Knowledge Model (Canonical)

This document defines the canonical **External Knowledge Model**: what the engine can “know” about the outside world, how that knowledge is represented as auditable objects, and how objects relate as a graph.

**Objective:** answer one question:

> What does the engine actually know about the outside world?

**Non-goals:**
- Not an ingestion design.
- No crawlers/APIs/schedulers.
- No database schema.
- No UI.

The model is intentionally **source-agnostic**. Sources are inputs; the model is the durable representation.

---

## 0) Core principles

1) **Knowledge objects, not articles.** Articles are evidence containers; the system stores normalized knowledge objects.
2) **Graph-first.** Entities, events, relationships, and trends are connected as a graph, not isolated feed items.
3) **Time is first-class.** Every object has an effective window and lifecycle state.
4) **Confidence is layered.** Separate:
   - **Source credibility** (how trustworthy the input is)
   - **Entity confidence** (how real/active the entity is)
   - **Relationship strength** (how strong/confirmed the link is)
   - **Opportunity confidence** (how actionable the opportunity is)
5) **Decision quality is the metric.** Knowledge exists to improve decision quality and explain restraint.
6) **Source score ≠ signal score.** A high-quality source can publish irrelevant content; a low-confidence community source can surface an early weak signal that requires corroboration.

---

## 1) Canonical knowledge objects

The model defines distinct objects. Do not collapse articles, events, trends, findings, and opportunities into the same object.

### 1.1 Source Record
A canonical record describing an external source (not its content).

**Required fields:**
- `source_id` (stable)
- `name`
- `source_type` (official | industry_reporting | market_data | community | research | calendar)
- `domains[]` (canonical business domains)
- `access_method` (api | rss | newsletter | public_webpage | licensed_feed | manual_report)
- `credibility_tier` (high | medium | low)
- `expected_update_cadence`
- `expected_latency`
- `terms_constraints` (public | paywalled | licensed | terms_restricted | manual_only | unsuitable_for_automation)
- `geographic_scope`
- `enabled_state` (proposed | trial | active | promoted | demoted | paused | retired | replaced)
- `schema_version`

### 1.2 Evidence Reference
A pointer to an evidence artifact and the minimal metadata required to audit it.

**Required fields:**
- `evidence_id` (stable)
- `source_id`
- `source_reference` (URL/identifier)
- `retrieved_at`
- `published_at` (nullable)
- `content_hash` (optional; for dedupe/audit)
- `credibility` (score 0–1 + reasons)
- `corroborating_evidence_ids[]`
- `contradicting_evidence_ids[]`
- `relevance_window` (start/end)
- `expires_at` (nullable)
- `geography` (nullable)
- `schema_version`

### 1.3 External Signal
A normalized, time-bounded external observation derived from one or more evidence references.

Signals are the “facts” of the outside world. They can be weak, and they can be wrong, but they must be auditable.

**Required fields:**
- `signal_id` (stable)
- `signal_type` (verified_event | trend_signal | market_observation | forecast | opinion | rumor | hypothesis)
- `domains[]`
- `subject_entities[]` (entity refs)
- `event_time` (nullable)
- `retrieved_at`
- `relevance_window` (start/end)
- `expires_at` (nullable)
- `geography` (nullable)
- `claims[]` (structured claim objects)
- `expected_business_mechanism`
- `credibility` (score 0–1 + reasons)
- `corroboration` (refs)
- `contradiction` (refs)
- `links`:
  - `linked_internal_fact_refs[]` (nullable)
  - `linked_internal_finding_ids[]` (nullable)
  - `linked_internal_hypothesis_ids[]` (nullable)
  - `linked_fusion_candidate_ids[]` (nullable)
- `lifecycle_status` (active | expired | superseded)
- `schema_version`

### 1.4 Entity
A durable “thing” in the world.

Examples: athlete, team, league, artist, gallery, auction house, brand, university, charity, platform, collector segment, product line, documentary.

**Required fields (canonical):**
- `entity_id` (stable)
- `entity_type` (see Entity Types)
- `name` (primary)
- `aliases[]` (optional)
- `domains[]` (canonical business domains it participates in)
- `geography` (optional)
- `entity_confidence` (see §4)
- `lifecycle_status` (active | inactive | historical | expired)
- `effective_start` / `effective_end` (nullable)
- `evidence_refs[]` (pointers to supporting external-signal facts)

### 1.5 Event
A time-bounded occurrence that changes state.

Examples: partnership announcement, licensing deal, documentary release, athlete trade, auction result, search spike.

**Required fields:**
- `event_id` (stable)
- `event_type` (see Event Taxonomy)
- `headline` (short)
- `event_time` (timestamp or date; nullable if uncertain)
- `retrieved_at` (when the system observed it)
- `relevance_window` (start/end)
- `involved_entities[]` (entity references + roles)
- `claims[]` (structured claims the event asserts)
- `mechanism_notes` (why it matters; mechanism-linked)
- `confidence` (event-level confidence)
- `evidence_refs[]`

### 1.6 Relationship
A typed edge between two entities.

Examples:
- athlete → signs with brand
- gallery → represents artist
- label → releases album
- auction house → sells artwork
- team → located_in city

**Required fields:**
- `relationship_id` (stable)
- `relationship_type` (typed)
- `from_entity_id`, `to_entity_id`
- `strength` (see §5)
- `effective_start` / `effective_end`
- `evidence_refs[]`

### 1.7 Trend
A time series or directional signal.

Examples: search demand rising for athlete; collector liquidity weakening; auction prices rising.

**Required fields:**
- `trend_id`
- `trend_type` (search, social, market, economic, sentiment)
- `subject` (entity_id or domain)
- `direction` (up | down | flat | volatile)
- `window` (start/end)
- `magnitude` (normalized scale + raw values when available)
- `confidence`
- `evidence_refs[]`

### 1.8 External Finding
A cross-signal conclusion about the external world that is stronger than any individual signal, but still not an opportunity.

Examples:
- “Documentary release is likely to increase search demand for subject X over the next 30 days.”
- “Collector demand for category Y is rising while competitor supply is flat.”

**Required fields:**
- `external_finding_id`
- `finding_type` (market_shift | competitor_move | partnership_shift | demand_shift | sentiment_shift | licensing_shift)
- `domains[]`
- `affected_entities[]`
- `affected_markets[]` (geographies/segments/channels)
- `window` (start/end)
- `confidence`
- `expected_business_mechanism`
- `supporting_signal_ids[]`
- `contradicting_signal_ids[]`
- `missing_evidence[]`
- `links`:
  - `linked_internal_fact_refs[]`
  - `linked_internal_finding_ids[]`
  - `linked_fusion_candidate_ids[]`
- `schema_version`

### 1.9 Opportunity
A hypothesis-backed, time-bounded claim that a valuable action may exist.

Examples: upcoming anniversary + rising demand + licensing availability → limited edition opportunity.

**Required fields:**
- `opportunity_id`
- `opportunity_type` (licensing, partnership, subject selection, launch window, collector outreach, etc.)
- `domains_involved[]` (cross-domain allowed)
- `primary_entities[]` (who/what the opportunity is about)
- `time_horizon` (immediate | near_term | medium_term | long_term)
- `opportunity_confidence` (see §6)
- `lifecycle_stage` (see §7)
- `what_must_be_true[]` (falsifiable prerequisites)
- `missing_evidence[]` (explicit)
- `expected_mechanism` (explicit)
- `expected_value_proxy` (optional; qualitative or normalized)
- `risks[]` (linked Risk objects)
- `evidence_refs[]`

### 1.10 Risk
A time-bounded negative scenario that affects decisions.

Examples: licensing conflict risk; supply chain disruption; reputational issue.

**Required fields:**
- `risk_id`
- `risk_type`
- `affected_entities[]`
- `window`
- `severity` (low/med/high)
- `confidence`
- `mitigations[]` (optional)
- `evidence_refs[]`

---

## 2) Relationship graph: how knowledge connects

The world model is a graph with typed edges. Examples of canonical edge patterns:

- **Partnership**: `Entity(Athlete) —partners_with→ Entity(Brand)` (event creates/updates relationship)
- **Representation**: `Entity(Gallery) —represents→ Entity(Artist)`
- **Media influence**: `Event(Documentary Release) —increases→ Trend(Search Demand)`
- **Demand linkage**: `Trend(Search Demand) —correlates_with→ Trend(Collector Demand)` (explicitly non-causal unless proven)
- **Opportunity derivation**: `Trend + Event + Relationship —supports→ Opportunity`

**Rule:** every derived edge must carry its evidence references and time window.

---

## 3) Signal disposition model (noise filtering)

Signals must be filtered by **decision relevance**, not popularity.

### Dispositions (canonical)

1) **suppress**
   - Meaning: drop from active processing; keep only minimal counters for portfolio scoring.
   - Requirements: low relevance OR low credibility; popularity does not override.
   - Expiration: immediate.
   - Review cadence: none.

2) **archive_only**
   - Meaning: retain as audit reference; do not contribute to findings/opportunities.
   - Requirements: credible but not currently relevant.
   - Expiration: keep for pattern memory; not active.
   - Review cadence: none.

3) **monitor**
   - Meaning: keep active, low-touch; await corroboration or cross-domain conjunction.
   - Requirements: moderate relevance OR participates in a known cross-domain pattern.
   - Credibility: can be medium/low if explicitly tagged as weak.
   - Expiration: short (days–weeks) unless reinforced.
   - Review cadence: weekly.

4) **validate**
   - Meaning: schedule corroboration tasks (future) against primary sources; still no operating recommendation.
   - Requirements: high relevance, but credibility incomplete.
   - Corroboration: required.
   - Expiration: short; invalidated if not corroborated.
   - Review cadence: daily.

5) **escalate_to_external_finding**
   - Meaning: combine multiple signals into a cross-signal conclusion.
   - Requirements: at least 2 supporting signals or one high-credibility verified event.
   - Contradiction: must be recorded.
   - Expiration: bounded window.

6) **escalate_to_opportunity**
   - Meaning: create a hypothesis-backed opportunity with explicit prerequisites.
   - Requirements: mechanism-linked, time-bounded, and lists missing evidence.
   - Popularity alone is insufficient.

7) **send_to_fusion_context**
   - Meaning: provide world-state context to Fusion (not a recommendation).
   - Requirements: high relevance + time alignment; must include evidence refs.
  - This does not force a decision.

---

### Disposition thresholds (architecture-level)

Each signal is evaluated across:
- business relevance
- entity relevance and audience overlap
- strategic fit (premium positioning, scarcity)
- licensing feasibility
- novelty
- time alignment (relevance window)
- source credibility (publisher-level)
- signal credibility (item-level)
- corroboration and contradiction
- duplication/overlap

Threshold summary:

- **suppress**
  - min business relevance: low
  - min source credibility: any
  - min signal credibility: any
  - corroboration: none
  - affects Fusion: no
  - operating recommendation: never

- **archive_only**
  - min business relevance: low–medium
  - min signal credibility: medium
  - corroboration: not required
  - affects Fusion: no
  - operating recommendation: never

- **monitor**
  - min business relevance: medium OR participates in cross-domain conjunction
  - min signal credibility: low–medium (explicitly tagged)
  - corroboration: optional
  - expiration: short window; renewed only when reinforced
  - affects Fusion: context only (not candidates)
  - operating recommendation: never

- **validate**
  - min business relevance: high
  - min signal credibility: medium
  - corroboration: required against primary sources
  - affects Fusion: context only until corroborated
  - operating recommendation: never

- **escalate_to_external_finding**
  - min business relevance: high
  - min signal credibility: medium-high
  - corroboration: required OR multiple independent signals
  - contradiction: must be recorded
  - affects Fusion: yes (as context)
  - operating recommendation: never directly

- **escalate_to_opportunity**
  - min business relevance: high
  - min signal credibility: high
  - internal-fit requirement: explicit (positioning/scarcity/licensing)
  - missing evidence: explicit list required
  - affects Fusion: yes (as candidate/context)
  - operating recommendation: only if Fusion’s internal policy allows it

- **send_to_fusion_context**
  - min business relevance: high
  - min signal credibility: high
  - time alignment: required
  - affects Fusion: yes (context)
  - operating recommendation: never directly

**Popularity rule:** high popularity/virality may increase review urgency, but cannot by itself raise disposition.

### Relevance gates (minimum)
A signal must be suppressed/archived unless it is relevant to at least one of:
- collectors, demand, and willingness-to-pay
- premium positioning / scarcity constraints
- licensing/IP availability or constraints
- partnerships/collaborations
- geographic markets and audience overlap
- operational risks (shipping/fulfillment)

---

## 4) Cross-domain discovery (weak-signal preservation)

Weak signals may survive filtering when they participate in a meaningful cross-domain pattern.

Rule: the system may elevate a set of individually weak signals into an External Finding **without claiming causality**, by explicitly stating:
- the connecting entities/relationships
- the combined mechanism hypothesis
- missing evidence and what would validate/invalidate

### Worked weak-signal intersection examples (non-causal)

Each example below shows:
- component signals (individually weak)
- connecting entities/relationships
- combined mechanism hypothesis
- missing evidence
- why it survives filtering
- disposition outcome (monitor | validate | external finding | opportunity | fusion context)

1) **Sports × Collectibles × Regional demand**
   - Component signals:
     - Social: a team/athlete highlight clip goes viral (weak, noisy)
     - Market: a small rise in memorabilia auction closes for that athlete (weak)
     - Search: localized Google Trends increase in athlete/team query (weak)
   - Links:
     - athlete → plays_for → team → located_in → geography
     - athlete → relevant_to → memorabilia category
   - Mechanism (hypothesis): regional attention spike may increase collector demand for a narrow window.
   - Missing evidence: corroborating auction volume, pricing breadth, and whether attention is sustained.
   - Survives filtering because: cross-domain conjunction + time-bounded window.
   - Disposition: **monitor** → **validate** if corroborated by primary transaction data.

2) **Documentary × Search momentum × existing artwork**
   - Component signals:
     - Event: documentary announced/released (single-source or early report)
     - Trend: search demand rises for subject
     - Internal inventory: existing artwork subject alignment (internal fact)
   - Links:
     - documentary → about → entity(subject)
     - trend(search) → subject
   - Mechanism (hypothesis): documentary drives renewed interest; existing artwork can be timed to demand.
   - Missing evidence: confirmation of release date, sustained search trend, competitor releases.
   - Survives filtering because: affects demand timing and subject selection.
   - Disposition: **validate** → **opportunity** if release timing and sustained trend corroborate.

3) **Music tour × Geographic customer concentration**
   - Component signals:
     - Event: tour dates announced (credible)
     - Trend: city-level social chatter increases (weak)
     - Internal: customer concentration in tour cities (internal fact)
   - Links:
     - musician → tours_in → geography
     - customer_segment → concentrated_in → geography
   - Mechanism (hypothesis): tour attention increases local willingness-to-buy premium work.
   - Missing evidence: licensing feasibility, venue partner access, tour marketing intensity.
   - Survives filtering because: targets a specific market window.
   - Disposition: **external finding** → **opportunity** if corroborated by search/social + internal demand.

4) **Anniversary × Licensing feasibility × Competitor inactivity**
   - Component signals:
     - Calendar: milestone anniversary upcoming
     - Signal: rights-holder newsroom indicates licensing openness (weak)
     - Competitor monitoring: no comparable premium releases in last 12–18 months (weak)
   - Links:
     - entity(subject) → has_anniversary → date
     - rights_holder → owns_rights_to → subject
     - competitor → released → comparable_product (absence as weak signal)
   - Mechanism (hypothesis): rare window for premium timed release if licensing is feasible.
   - Missing evidence: confirmed licensing path, collector appetite, channel strategy.
   - Survives filtering because: scarcity + timing + rights feasibility.
   - Disposition: **validate** → **opportunity**.

5) **Gallery trend × Athlete partnership × Premium positioning**
   - Component signals:
     - Relationship: gallery begins representing (or heavily featuring) sports-adjacent work (weak unless corroborated)
     - Event: athlete/brand partnership activity rises (weak, noisy)
     - Market: premium auction outcomes for similar subjects/mediums (credible)
   - Links:
     - gallery → represents → artist
     - athlete → partnered_with → brand
     - collector_segment → prefers → premium positioning
   - Mechanism (hypothesis): a premium-aligned collaboration window may exist if gallery/brand signals align.
   - Internal evidence: prior collector responses to premium sports subjects; capacity constraints.
   - Missing evidence: licensing feasibility; explicit partner interest; audience overlap verification.
   - Risk/contradiction: partnership may be pure marketing; gallery move may be unrelated.
   - Timing window: weeks–months.
   - Disposition: **monitor** → **validate** (partner confirmation) → **opportunity**.

6) **Auction results × Subject momentum × Collector liquidity**
   - Component signals:
     - Market: strong auction closes for a subject category (credible)
     - Trend: search/social modest lift for the subject (weak)
     - Economic: liquidity proxy stable (credible)
   - Links:
     - subject_category → correlates_with → collector spending
     - economic_indicator → influences → discretionary spending (explicitly non-causal unless proven)
   - Mechanism (hypothesis): collector willingness-to-pay may support premium positioning for a narrow window.
   - Missing evidence: breadth across auction houses, competitor supply, internal conversion signals.
   - Survives filtering because: transaction truth + timing.
   - Disposition: **external finding** → **fusion context** (contextual reprioritization only).

7) **Competitor launch × Customer overlap × Product white space**
   - Component signals:
     - Competitor monitoring: competitor launches a new edition/format (observed, not proof)
     - Internal: customer segment overlap (internal evidence)
     - Market: absence of premium alternatives in a niche (weak; requires validation)
   - Links:
     - competitor → competes_with → your positioning
     - customer_segment → overlaps_with → competitor_audience
   - Mechanism (hypothesis): competitor launch indicates demand direction, leaving a premium white space.
   - Missing evidence: pricing power, scarcity appetite, whether demand is transient.
   - Risk: copying competitor without mechanism; saturation.
   - Disposition: **validate** → **external finding**; may become **opportunity** if corroborated by demand + market response.

---

## 5) Relationship taxonomy (canonical)

Relationships are directional where appropriate and must support:
- observed vs inferred
- evidence references
- valid-from / valid-until
- last_verified_at
- source credibility
- lifecycle status

Minimum relationship types:
- represents
- collaborates_with
- partnered_with
- licensed_by
- licensed_to
- owns_rights_to
- plays_for
- formerly_played_for
- managed_by
- sponsored_by
- collected_by
- sold_by
- exhibited_by
- affiliated_with
- competes_with
- substitutes_for
- shares_audience_with
- influences
- mentioned_in
- participates_in
- located_in
- relevant_to
- created
- released
- acquired
- auctioned
- supports_charity
- scheduled_for

Historical relationships must not be deleted; they transition to `historical`/`expired` with a bounded effective window.

---

## 6) Event taxonomy (canonical)

Events are not equal. The taxonomy is designed to support decision relevance.

### 3.1 Strategic Events
- Partnership
- Licensing deal / licensing availability
- Acquisition / merger
- New product / new collection
- Brand collaboration
- NIL announcement

### 3.2 Market Events
- Search spike
- Social virality
- Auction result
- Print sellout
- Gallery opening / exhibition
- Market pricing shift
- Collector liquidity shift

### 3.3 Risk Events
- Licensing conflict
- Reputation issue
- Supply chain disruption
- Shipping disruption
- Competitor saturation
- Regulatory/legal change

### 3.4 Opportunity Events (time-window catalysts)
- Anniversary / milestone
- Retirement
- Hall of Fame eligibility/induction
- Movie/documentary release
- Album release / tour
- Championship run
- Olympic / World Cup cycle
- Expansion team / stadium opening

---

## 7) Entity confidence (separate from source credibility)

Entity confidence expresses whether an entity is real/active and how certain we are.

Canonical levels:
- `known`
- `likely`
- `possible`
- `rumor`
- `speculation`
- `historical`
- `inactive`
- `expired`

---

## 8) Relationship strength

Relationship strength expresses the stability/confirmation level of an edge.

Canonical levels:
- `confirmed`
- `probable`
- `weak`
- `emerging`
- `historical`
- `expired`

---

## 9) Opportunity confidence (the language Fusion consumes)

Canonical levels:
- `interesting`
- `worth_monitoring`
- `worth_validating`
- `actionable`
- `time_critical`

**Rule:** “actionable” requires explicit prerequisites + evidence, and must remain auditable.

---

## 10) Opportunity lifecycle

Opportunities must support both **timing** and **decision lifecycle** states.

### 8.1 Timing lifecycle (market timing)
- `birth`
- `growth`
- `peak`
- `decline`
- `expired`

### 8.2 Decision lifecycle (opportunity handling)
- `discovered`
- `validating`
- `monitoring`
- `actionable`
- `time_critical`
- `acted_on`
- `declined`
- `invalidated`
- `archived`

The lifecycle is not narrative; it is an auditable timing + handling model used for prioritization and review.

---

## 11) Canonical entity types (minimum set)

The system must support entity types spanning:

### People
- athlete, musician, artist, celebrity, coach, executive, collector, agent_manager

### Organizations
- team, league, university, nil_collective, gallery, museum, auction_house, card_company, memorabilia_company,
  entertainment_company, label, brand, charity, media_company, licensing_org, agency, platform

### Commercial objects
- artwork, product, edition, collection, trading_card, memorabilia_item, campaign, partnership, event,
  exhibition, documentary, tour, album, film

### Markets and audiences
- geographic_market, collector_segment, fan_community, customer_segment, subject_category, price_tier, channel

### Role tags (entity can hold multiple roles)
Entities can carry multiple tags such as:
- competitor
- potential_partner
- collaborator
- customer_interest_subject
- market_signal_source
- licensing_owner
- strategic_benchmark

---

## 12) Canonical entity types (domain groupings)

### Sports
- athlete, team, league, university, coach, agent_manager, brand_sponsor

### Music / Entertainment
- musician, label, promoter, venue, documentary, studio, publisher

### Art / Market
- artist, gallery, curator, auction_house, fair, museum, collector, collector_segment, print_publisher

### Collectibles / Memorabilia
- grading_company, marketplace, card_publisher, memorabilia_platform, auction_platform

### Business / Platforms
- brand, retailer, platform, influencer, media_outlet

### Signals / Context
- search_query, social_topic, economic_indicator, regulation, shipping_lane

---

## 13) Entity resolution and duplicate-event handling (requirements)

Do not implement entity resolution in this milestone.

Architecture requirements:
- **Canonical IDs**: every entity/event has a stable canonical id.
- **Aliases**: entities must store aliases (nicknames, former names, common misspellings).
- **Name changes**: support historical names without breaking references.
- **Ambiguous names**: keep ambiguity explicit until resolved; do not merge prematurely.
- **Source-specific identifiers**: store per-source ids (league ids, platform ids, auction lot ids).

Duplicate-event handling requirements:
- multiple evidence references may map to one Event
- later corrections are modeled as:
  - an Event update (superseding fields) plus
  - new Evidence References that corroborate/contradict
- contradictory reports are preserved (do not delete); they reduce confidence and force validation

---

## 14) Breaking-news handling (requirements)

Breaking news increases review urgency but must not lower evidence standards.

Canonical breaking-news states:
- `verified_breaking_event`
- `single_source_report`
- `developing_report`
- `rumor`
- `correction`
- `retraction`
- `later_confirmation`

Propagation rules:
- Event: updated with correction/retraction metadata and linked evidence
- Signal: may be superseded/expired
- External Finding: updated confidence + contradiction list
- Opportunity: may advance, hold, or be invalidated
- Fusion context: may update the world-state context, but still cannot force an operating recommendation

---

## 15) Pipeline consistency (canonical)

Source Record
→ Evidence Reference
→ External Signal
→ canonical Entity/Event/Relationship update
→ Trend or External Finding
→ Opportunity or Risk
→ Strategic World Model
→ Fusion Candidate or Fusion Context
→ Recommendation
→ Action
→ Outcome
→ source-usefulness learning

Raw articles must not flow directly into Fusion as recommendations.

---

## 9) How this model evolves over time

- New sources map into the same objects: Entity/Event/Relationship/Trend/Opportunity/Risk.
- New domains add taxonomy values, not new object categories.
- Confidence/strength evolve via versioned updates (never silent overwrites).
- Objects can be superseded/expired, not deleted.

---

## 16) Compatibility with existing external-signal fact model

The existing `External Signal Fact Model (v1)` remains the **evidence layer**.

This External Knowledge Model is the **knowledge layer** (normalized state). Evidence facts reference knowledge objects; knowledge objects reference evidence facts.
