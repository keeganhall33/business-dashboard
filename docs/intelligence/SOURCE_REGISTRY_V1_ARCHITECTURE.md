# Source Registry V1 (Architecture)

**Milestone:** SOURCE REGISTRY V1 (architecture only)

This document defines the canonical, governed **Source Registry** that must exist *before* any external adapters, crawlers, schedulers, APIs, or pipelines are written.

**Non-goals (explicit):**
- No ingestion.
- No crawlers.
- No APIs.
- No schedulers.
- No database migrations.
- No production code.

**Objective:** make adding/removing/promoting/pausing sources a **configuration change**, not a code change, and make source quality **self-improving** via observed business outcomes.

---

## 0) Definitions (what this registry governs)

- **Source**: a single publisher/provider/system that can produce Evidence (e.g., “USPTO trademarks”, “Google Trends”).
- **Source Set**: a governed collection of sources (e.g., “Competitor Monitoring Set”) with bounded membership rules.
- **Evidence Reference**: a pointer to a retrieved artifact (URL/id/hash + timestamps + terms context).
- **Signal**: a normalized observation derived from evidence.
- **External Finding**: a cross-signal conclusion.
- **Opportunity/Risk**: a hypothesis-backed, time-bounded object.

Registry scope includes:
- metadata (what the source is)
- governance (enabled state, wave, legal access)
- expected outputs (entity/event/relationship/signal classes)
- learning (how source usefulness is measured)

---

## 1) Architecture pipeline (attribution spine)

The registry must support end-to-end traceability:

**Source / Source Set**
→ **Evidence Reference**
→ **External Signal**
→ **External Finding**
→ **Opportunity / Risk**
→ **Fusion Candidate / Fusion Context**
→ **Daily Decision**
→ **Action (if any)**
→ **Business Outcome**
→ **Source & Signal performance learning**

Rules:
- Raw articles never become recommendations directly.
- Popularity alone is insufficient.
- One weak source cannot trigger an operating action.
- Rumor can create a monitored hypothesis only.
- A verified official event may update the World Model immediately (as a state update), but still does not force an operating action.
- Licensing infeasibility blocks actionability.

---

## 2) Canonical Source Registry schema (declarative)

### 2.1 SourceRecord
A canonical definition of a source.

**Stable identity**
- `source_id` (string, stable; namespaced)

**Required fields**
- `name`
- `domains[]` (canonical external-intelligence domains)
- `source_type` (official | industry_reporting | market_data | community | research | calendar)
- `authority_level` (primary | secondary | community)
- `access_classification` (official_api | public_rss | licensed_feed | approved_newsletter | public_structured_export | public_webpage_manual_review | paywalled_manual_only | terms_restricted | unsuitable_for_automation)
- `expected_update_cadence` (daily/weekly/episodic/etc.)
- `expected_latency_slo` (e.g., minutes/hours/days)
- `geographic_scope` (global | US | region list)
- `terms_risk` (low | medium | high)
- `enabled_state` (proposed | trial | active | promoted | demoted | paused | retired | replaced)
- `wave` (wave_1 | wave_2 | wave_3)
- `owner` (human/team)
- `schema_version` (for this registry record)
- `created_at`, `updated_at`

**Expected outputs (declarative contracts)**
- `supported_entity_types[]`
- `supported_event_types[]`
- `supported_relationship_types[]`
- `supported_signal_classes[]` (verified_event | trend_signal | market_observation | rumor | etc.)
- `expected_opportunity_classes[]`
- `expected_risk_classes[]`

**Confidence characteristics**
- `default_source_credibility_tier` (high|medium|low)
- `expected_noise_level` (low|medium|high)
- `expected_duplication_level` (low|medium|high)
- `overlap_with_sources[]` (source_id + overlap hypothesis)

**Freshness expectations**
- `freshness_window` (how long signals remain active)
- `expiration_policy` (suppress/archive/monitor)

**Operational metadata (non-secrets)**
- `reference_urls[]` (public docs, newsletters, official pages)
- `notes` (why it matters / unique signal)
- `fallback_sources[]` (source_ids)

### 2.2 SourceStatus (separate from SourceRecord)
Status must be writable without rewriting the source definition.

- `source_id`
- `enabled_state`
- `wave`
- `disabled_reason` (if paused/retired)
- `last_reviewed_at`
- `review_notes`

---

## 3) Source Set schema (governed collections)

### 3.1 SourceSetRecord
- `source_set_id` (stable)
- `name`
- `domains[]`
- `purpose` (why this set exists)
- `membership_rule` (bounded, explicit)
- `max_members` (hard cap; prevents loopholes)
- `review_cadence`
- `default_access_classification` (for members)
- `default_credibility_tier`
- `allow_member_disable` (boolean)
- `duplicate_handling_policy` (how to dedupe inside set)
- `schema_version`

### 3.2 SourceSetMembership
- `source_set_id`
- `source_id`
- `member_role` (primary | corroboration | weak_signal)
- `member_priority`
- `member_enabled_state`

**Governance rule:** a source set cannot become an unlimited bucket. Membership must be reviewed and capped.

---

## 4) Business Outcome Attribution model (permanent)

### 4.1 AttributionChain
A trace object that links upstream intelligence to downstream outcomes.

- `attribution_id`
- `source_ids[]` (one or many)
- `evidence_ids[]`
- `signal_ids[]`
- `external_finding_ids[]`
- `opportunity_ids[]`
- `fusion_run_id`
- `fusion_candidate_ids[]`
- `daily_decision_run_id` / decision id
- `action_ids[]` (nullable)
- `outcome_ids[]` (nullable)
- `measured_value` (nullable, numeric)
- `attribution_confidence` (low|medium|high)
- `notes`

**Key rule:** attribution must allow multiple sources to contribute to one opportunity (cross-domain conjunction).

### 4.2 BusinessOutcome
A canonical representation of an observed outcome (internal).

- `outcome_id`
- `outcome_type` (revenue, margin, lead, partnership, audience growth, authority signal, operational risk avoided)
- `measured_at`
- `window`
- `value`
- `confidence`
- `linked_internal_facts[]`

---

## 5) Source learning model (self-improving)

### 5.1 Signal contribution score (anti-volume)
A source must not be rewarded for publishing volume. The system learns quality via downstream impact.

Proposed components:
- **Finding conversion rate**: signals → external findings
- **Opportunity conversion rate**: findings → opportunities
- **Fusion survival rate**: opportunities/candidates that remain relevant and survive policy gates
- **Outcome association rate**: opportunities/actions → measurable outcomes
- **Lead-time advantage**: earlier detection vs other sources
- **Duplication penalty**: overlap with other sources
- **Noise burden**: suppressed/archived proportion
- **Terms/legal risk penalty**: access instability and legal risk

Outputs:
- recommend: promote/demote/pause/retire/replace
- recommend cadence changes

### 5.2 Separate source-level vs signal-level scoring
- **Source score** tracks historical reliability/usefulness.
- **Signal score** tracks item-level credibility/relevance.

A high-quality source can publish irrelevant items; a weak source can produce an early signal (monitor-only until corroborated).

---

## 6) Registry persistence model (architecture)

The registry should be stored as **declarative configuration** plus optional persisted learning counters.

- **Config layer (source-of-truth):** versioned in repo (reviewed PRs)
- **Runtime snapshot:** loaded once at startup; changes require redeploy/reload (future)
- **Learning layer:** persisted metrics keyed by `source_id` and `source_set_id` (future)

No schema/migration decisions are made in this milestone.

---

## 7) Versioning strategy

- `registry_schema_version`: version of the registry format
- each SourceRecord carries `schema_version`
- changes to required fields are additive and backward-compatible
- deprecations require explicit migration plan

---

## 8) Governance rules

- Every source must have: purpose, access classification, and expected outputs.
- Terms-restricted sources cannot be enabled-by-default.
- Source sets have caps and review cadence.
- Promotion/demotion requires evidence thresholds (see §9).

---

## 9) Source status evidence thresholds (minimum)

Transitions must be evidence-based and anti-volume.

- **proposed → trial**
  - defined SourceRecord + compliant access path + clear unique signal hypothesis

- **trial → active**
  - compliant access proven
  - observation window sufficient (time-bounded)
  - acceptable reliability and manageable noise
  - produces at least some unique signals that map into the knowledge model

- **active → promoted**
  - repeated lead-time advantage or unique corroboration value
  - produces valid Findings/Opportunities
  - repeatedly relevant to Fusion context/candidates
  - acceptable false-positive rate

- **active → demoted/paused**
  - sustained duplication + falling relevance
  - excessive noise burden
  - access instability or unresolved terms risk
  - poor downstream usefulness

- **paused → active**
  - access restored and terms risk addressed
  - renewed unique value hypothesis

- **active → retired**
  - persistently low decision usefulness
  - superior replacement exists
  - unacceptable legal/access risk
  - no longer relevant to monitored domains

- **retired → replaced**
  - replacement source_id documented and validated

---

## 10) Testing strategy (architecture)

Tests must prove:
- registry schema validity
- source ids stable and unique
- source sets capped and membership rules enforced
- access classifications are explicit
- wave sequencing is consistent
- learning model calculations are deterministic

---

## 11) Implementation sequence (future; no code in this milestone)

1) Commit declarative registry format and source sets.
2) Add validation tests for schema + governance.
3) Only then implement runtime loading (later milestone).
4) Only then consider ingestion/adapters.

---

## 12) Decision unlocked

We can now evaluate and prioritize external sources against one canonical registry and attribution model instead of building disconnected feeds.
