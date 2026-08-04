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

## 3) Relationship taxonomy (canonical)

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

## 4) Event taxonomy (canonical)

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

## 5) Entity confidence (separate from source credibility)

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

## 6) Relationship strength

Relationship strength expresses the stability/confirmation level of an edge.

Canonical levels:
- `confirmed`
- `probable`
- `weak`
- `emerging`
- `historical`
- `expired`

---

## 7) Opportunity confidence (the language Fusion consumes)

Canonical levels:
- `interesting`
- `worth_monitoring`
- `worth_validating`
- `actionable`
- `time_critical`

**Rule:** “actionable” requires explicit prerequisites + evidence, and must remain auditable.

---

## 8) Opportunity lifecycle

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

## 9) Canonical entity types (minimum set)

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

## 10) Canonical entity types (domain groupings)

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

## 9) How this model evolves over time

- New sources map into the same objects: Entity/Event/Relationship/Trend/Opportunity/Risk.
- New domains add taxonomy values, not new object categories.
- Confidence/strength evolve via versioned updates (never silent overwrites).
- Objects can be superseded/expired, not deleted.

---

## 11) Compatibility with existing external-signal fact model

The existing `External Signal Fact Model (v1)` remains the **evidence layer**.

This External Knowledge Model is the **knowledge layer** (normalized state). Evidence facts reference knowledge objects; knowledge objects reference evidence facts.
