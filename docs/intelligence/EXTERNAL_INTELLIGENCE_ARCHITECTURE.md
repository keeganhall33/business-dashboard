# External Intelligence Architecture

This document defines how external-world signals are represented, validated, and fused into business reasoning.

## Purpose

External intelligence provides context and opportunity discovery beyond internal telemetry. It must never override internal evidence without explicit qualification.

## Core components

### 1) External Intelligence Layer
- Collects external signals.
- Normalizes them into structured facts.
- Scores credibility and expires signals.

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
