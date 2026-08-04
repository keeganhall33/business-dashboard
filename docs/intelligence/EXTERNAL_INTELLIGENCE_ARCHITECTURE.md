# External Intelligence Architecture

This document defines how external-world signals are represented, validated, learned-from, and fused into business reasoning.

## Purpose

External Intelligence is not “monitor websites.”

It is a permanent capability for understanding the current state of the business ecosystem (industry, culture, markets, competitors, partners, constraints) and identifying opportunities/risks that meaningfully change decision quality.

External signals must never override internal evidence without explicit qualification.

## Core components

### Strategic World Model (permanent)

**Purpose:** maintain a living, auditable graph of the external ecosystem so Fusion reasons over **state**, not raw articles.

The world model maintains (at minimum):
- **Entities** (people, teams, leagues, labels, galleries, auction houses, platforms, brands, products, events)
- **Relationships** (ownership, partnership, sponsorship, licensing/IP links, influence, audience overlap)
- **Events** (announcements, releases, injuries, tours, auctions, policy changes)
- **Trends** (demand shifts, collector liquidity, search/social momentum)
- **Opportunities** (hypothesis-backed, time-bounded)
- **Risks** (time-bounded, mechanism-linked)
- **Outcomes** (what actually happened, when measurable)

**Key rule:** Fusion consumes the world model and its derived opportunities/risks, not raw source payloads.

### Source Registry (permanent)

Every external source must exist in a canonical registry. Sources are evaluated continuously and may be promoted/demoted/retired based on measured usefulness.

Minimum registry fields:
- `source_id` (stable)
- `domain` (business-domain taxonomy; see below)
- `category` (source type: news, filings, social, marketplace, calendars, etc.)
- `base_domain` / `system` (where it comes from)
- `expected_update_frequency`
- `latency_slo`
- `reliability_score` (0–1)
- `historical_usefulness_score` (0–1)
- `false_positive_rate` (rolling)
- `overlap_score_by_source_id` (rolling)
- `estimated_signal_value`
- `enabled_state` (enabled | disabled | shadow)
- `last_seen_at` / `last_success_at`

**Registry invariant:** a source only exists if it improves decision quality, and the system can justify its continued use.

### Source Performance Learning (permanent)

The system tracks which sources produced useful signals over time:
- earliest detection vs confirmed outcomes
- duplication/overlap with other sources
- downstream conversion to Findings/Hypotheses/Opportunities
- downstream conversion to Recommendations/Actions/Outcomes

Outputs:
- promote/demote/retire recommendations for sources
- suggested replacements when a source becomes stale/noisy

### Cross-Domain Opportunity Detection (permanent)

High-value opportunities often exist at **intersections**. The system must intentionally search for cross-domain conjunctions, e.g.:
- Sports × Collectibles
- Music × Charity
- Gallery × Athlete
- Entertainment × Documentary
- Search Trends × Calendar
- Competitor Activity × Collector Demand
- Licensing/IP × Upcoming Anniversary
- Economic Conditions × Luxury Spending

### Competitive Intelligence Engine (permanent)

**Purpose:** continuously monitor competitors, adjacent creators, institutions, brands, teams, galleries, and market participants; interpret their strategic moves; connect them to internal evidence; and surface opportunities, risks, white space, positioning advantages, and recommended responses.

This subsystem must answer:
- What are competitors doing?
- Why are they likely doing it (strategic hypothesis)?
- Is it working (as far as we can tell)?
- What can we learn from it?
- What should we imitate, adapt, avoid, counter, or ignore?
- What opportunity does it reveal for this business?
- What second-order effects could their decisions create?
- Does it change what to create, promote, price, launch, partner on, or stop doing?

**Competitor universe:** dynamic; not a fixed list. Entities are tagged by category (direct artists, galleries, adjacent collectible businesses, brands/teams/institutions, etc.) and can be expanded over time.

**Rules:** competitor activity is external evidence and must follow the external evidence requirements (classification, credibility, time bounds, mechanism).

### 1) External Intelligence Layer
- Collects external signals.
- Normalizes them into structured facts.
- Scores credibility and expires signals.

**Noise filtering requirement:** signals are ranked by expected business relevance (not popularity). Every signal must answer “why this matters” to at least one canonical business domain.

### 2) External Signal Fact Model (v1)
Every external signal must eventually support:

- `signal_id` (stable)
- `category`
- `entity` and `entity_type`
- `source` and `source_type`
- `source_reference` (URL or identifier)
- `classification`:
  - `verified_event` | `trend_signal` | `market_observation` | `forecast` | `opinion` | `rumor` | `hypothesis`
- `event_time` (nullable)
- `retrieved_at`
- `relevance_start`
- `relevance_expires_at`
- `geography` (nullable)
- `credibility`:
  - `score` (0–1)
  - `reasons[]`
- `corroborating_sources[]`
- `contradictory_evidence[]`
- `expected_business_mechanism`
- `linked_internal_fact_refs[]` (nullable)
- `linked_finding_ids[]` (nullable)
- `linked_hypothesis_ids[]` (nullable)
- `linked_opportunity_ids[]` (nullable)
- `confidence` (level + reasons)
- `lifecycle_status` (active | expired | revalidated | superseded)
- `schema_version`

**Expiration rule:** expired signals remain available for audit and pattern memory, but must not influence active recommendations unless revalidated.

### 3) Entity and Relationship Graph
Connects:
- athletes, musicians, teams, leagues, events
- artworks, products
- campaigns, customer segments
- geographic markets
- cultural themes
- external signals

The graph enables overlap discovery, e.g.:
- athlete → team → city → fan market → existing customer concentration
- musician → tour → city → social momentum → available artwork
- documentary → subject → collector interest → outreach opportunity

### 4) Strategic Opportunity Fusion Engine
Fuses internal evidence with external context:
- External signals can re-rank opportunities only when the mechanism is explicit and the linkage to internal evidence is stated.
- Rumor/opinion may generate questions/hypotheses, not operating recommendations.

## Canonical External Intelligence Domains (permanent)

Organize around business domains (not websites). Each domain may have many sources.

Minimum domain set:
- Sports ecosystem
- Sports business
- Music industry
- Entertainment industry
- Art market
- Gallery ecosystem
- Collector market
- Memorabilia market
- Trading cards
- Licensing/IP
- Brand partnerships
- NIL
- Social trends
- Search demand
- Economic indicators
- Calendar & anniversaries
- Competitor intelligence
- Customer sentiment
- Shipping/logistics
- Technology/AI
- Regulatory/legal

## External-signal categories (canonical)

- Sports
- Music
- Entertainment & culture
- Art & collector markets
- Search & social momentum
- Commercial & competitive landscape
- Economic & consumer context
- Platform & regulatory context

Additions (permanent):
- Licensing/IP opportunity and risk
- Collector liquidity signals
- Shipping & fulfillment disruptions

## Fusion Engine policy configuration (reference)

The Fusion Engine reads a **version-controlled policy configuration** at:

- `config/strategic_constraints_v1.json`

This file is **production-affecting policy**. Changing it can change Fusion eligibility and ranking behavior.
Fusion runs must persist the deterministic content hash and the explicit config version.
