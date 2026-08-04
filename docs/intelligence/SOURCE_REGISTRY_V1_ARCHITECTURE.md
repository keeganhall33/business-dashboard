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

## 2) Canonical Source Registry contract (SourceRegistryEntry)

This section is the explicit contract for a registry entry. Every field is marked as:
- **Required** (must be provided in version-controlled config)
- **Optional** (allowed in config)
- **Derived** (computed; not hand-edited)
- **Learning** (persisted metrics over time; not required on day 1)

### 2.0 Identity and versioning

- `source_id` **(Required)**: stable, namespaced id
- `display_name` **(Required)**
- `description` **(Required)**
- `registry_schema_version` **(Required)**: version of the registry contract
- `source_config_version` **(Required)**: changes when meaningfully edited (audit-friendly)
- `created_at` **(Derived)**
- `updated_at` **(Derived)**

- `lifecycle_status` **(Required)**: proposed | trial | active | promoted | demoted | paused | retired | replaced
- `enabled` **(Required)**: boolean (operational toggle)
- `enabled_by_default` **(Required)**: boolean (must be false for paywalled/terms-restricted until approved)
- `owner` **(Required)**: accountable human/team
- `review_by` **(Optional)**: next planned human review date
- `replacement_source_ids[]` **(Optional)**

### 2.1 Classification

- `domains[]` **(Required)**
- `source_sets[]` **(Optional)** (declared membership; sets may also declare membership)
- `source_type` **(Required)**: official | industry_reporting | market_data | community | research | calendar
- `authority_level` **(Required)**: primary | secondary | community
- `geography` **(Optional)**: global | regions
- `languages[]` **(Optional)**
- `monitored_entities[]` **(Optional)**: canonical entity ids or patterns

- `supported_entity_types[]` **(Required)**
- `supported_event_types[]` **(Required)**
- `supported_relationship_types[]` **(Required)**
- `supported_signal_classes[]` **(Required)**
- `expected_opportunity_classes[]` **(Required)**
- `expected_risk_classes[]` **(Required)**

### 2.2 Access and legality

- `access_method` **(Required)**: official_api | public_rss | licensed_feed | approved_newsletter | public_structured_export | public_webpage_manual_review | paywalled_manual_only | terms_restricted | unsuitable_for_automation
- `access_status` **(Derived/Learning)**: unknown | working | degraded | broken
- `authentication_required` **(Required)**: boolean
- `paywalled` **(Required)**: boolean
- `licensing_required` **(Required)**: boolean
- `automation_suitability` **(Required)**: allowed | manual_only | prohibited
- `terms_review_status` **(Required)**: not_reviewed | approved | restricted | prohibited
- `copyright_handling` **(Required)**: quote_only | summary_only | licensed_fulltext | link_only
- `data_retention_restrictions` **(Optional)**
- `approved_fallback_method` **(Required)**: how to operate compliantly if automation is blocked
- `legal_risk_level` **(Required)**: low | medium | high
- `last_legal_review_at` **(Optional)**
- `legal_review_owner` **(Optional)**

### 2.3 Operational expectations

- `expected_cadence` **(Required)**
- `max_acceptable_latency` **(Required)**
- `freshness_threshold` **(Required)**
- `historical_availability` **(Optional)**
- `expected_volume` **(Optional)**
- `expected_noise` **(Required)**: low | medium | high
- `expected_duplication` **(Required)**: low | medium | high
- `implementation_difficulty` **(Optional)**
- `implementation_wave` **(Required)**: wave_1 | wave_2 | wave_3
- `implementation_status` **(Required)**: unimplemented | planned | in_progress | implemented

- `last_successful_collection_at` **(Learning)**
- `last_observed_signal_at` **(Learning)**

### 2.4 Quality and usefulness

Manual priors (config):
- `credibility_prior` **(Required)**: high | medium | low

Learned metrics (persisted over time):
- `reliability_score` **(Learning)** (0–1)
- `timeliness_score` **(Learning)** (0–1)
- `uniqueness_score` **(Learning)** (0–1)
- `relevance_score` **(Learning)** (0–1)
- `corroboration_value` **(Learning)** (0–1)
- `false_positive_rate` **(Learning)**
- `duplication_rate` **(Learning)**
- `signal_contribution_score` **(Learning)**
- `opportunity_yield` **(Learning)**
- `fusion_contribution` **(Learning)**
- `outcome_contribution` **(Learning)**
- `cost` **(Learning/Optional)**
- `access_stability` **(Learning)**

### 2.5 Registry persistence split (config vs durable metrics)

- **Version-controlled config (required):** identity, classification, legal/access fields, operational expectations, manual priors, wave, and governance settings.
- **Durable storage (learning):** rolling reliability/uniqueness/false-positive metrics, last-success timestamps, contribution chains.

The registry remains the canonical governor; learning augments it.

### 2.6 SourceStatus (separate from SourceRegistryEntry)

Status must be writable without rewriting the source definition.

- `source_id` **(Required)**
- `lifecycle_status` **(Derived/Optional)**
- `enabled` **(Required)**
- `implementation_status` **(Required)**
- `implementation_wave` **(Required)**
- `disabled_reason` **(Optional)**
- `last_reviewed_at` **(Optional)**
- `review_notes` **(Optional)**

---

## 3) Source Set contract (governed collections)

Source Sets must satisfy:
- membership can change without changing code
- individual members may be disabled
- one weak member does not automatically weaken every signal from the set (item-level signal scoring still applies)
- the set cannot expand without governance
- a governed set cannot become a loophole for monitoring hundreds of low-value sites

### 3.1 SourceSetRecord

- `source_set_id` **(Required)**
- `name` **(Required)**
- `purpose` **(Required)**
- `domains[]` **(Required)**
- `membership_rules` **(Required)** (bounded, explicit)
- `maximum_active_members` **(Required)** (hard cap)
- `required_member_diversity` **(Optional)** (e.g., must include at least N primary sources)
- `member_source_ids[]` **(Optional)** (declared list when static)
- `member_status_policy` **(Required)** (member enable/disable behavior)
- `individual_credibility_policy` **(Required)**
- `set_level_credibility` **(Derived/Learning)**
- `update_cadence` **(Required)**
- `review_cadence` **(Required)**
- `inclusion_reasons` **(Required)**
- `exclusion_reasons` **(Optional)**
- `duplicate_handling_policy` **(Required)**
- `source_set_owner` **(Required)**
- `source_set_version` **(Required)**
- `lifecycle_status` **(Required)**
- `legal_access_policy` **(Required)**
- `noise_budget` **(Optional)**
- `replacement_rules` **(Optional)**
- `schema_version` **(Required)**

### 3.2 SourceSetMembership

- `source_set_id` **(Required)**
- `source_id` **(Required)**
- `member_role` **(Required)**: primary | corroboration | weak_signal
- `member_priority` **(Optional)**
- `member_enabled` **(Required)**
- `member_credibility_override` **(Optional)**
- `member_inclusion_reason` **(Required)**
- `member_exclusion_reason` **(Optional)**

**Governance invariant:** sets are capped and reviewed. Membership change is a config mutation with audit trail, not a code change.

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

Additional required fields:
- `contribution_role` (originator | early_indicator | corroborator | contradiction_source | context_provider | disqualifying_evidence | timing_catalyst)
- `contribution_weight` (optional; normalized)
- `first_detection_at`
- `decision_at`
- `action_at` (nullable)
- `outcome_window`
- `confounders[]` (explicit)
- `regime` (nullable)
- `attribution_policy_version`

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

Score architecture requirements:
- bounded range (e.g., 0–1) with explicit uncertainty
- minimum sample sizes (do not learn from 1–2 items)
- time decay (recent performance matters more)
- protect against one large win dominating forever
- do not penalize a source solely because an action was not executed
- attribution sharing when multiple sources contributed
- regime awareness (different seasons/markets/platform shifts)

Separate:
- manual priors (config)
- observed metrics (rolling counters)
- learned score (computed)
- score confidence / uncertainty (computed)

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

  - required evidence: compliant access plan, explicit unique-signal hypothesis, expected outputs declared
  - minimum observation window: N/A
  - human review: required (approve trial)
  - automation: system may recommend; must not auto-enable
  - audit record: required
  - rollback: revert config to proposed

- **trial → active**
  - compliant access proven
  - observation window sufficient (time-bounded)
  - acceptable reliability and manageable noise
  - produces at least some unique signals that map into the knowledge model

  - required evidence: acceptable reliability + manageable noise + confirmed legal posture
  - minimum observation window: minimum trial window (e.g., 2–6 weeks)
  - human review: required (approve activation)
  - automation: system may recommend
  - audit record: required
  - rollback: demote to trial/paused

- **active → promoted**
  - repeated lead-time advantage or unique corroboration value
  - produces valid Findings/Opportunities
  - repeatedly relevant to Fusion context/candidates
  - acceptable false-positive rate

  - required evidence: sustained contribution score improvement + lead-time/corroboration value
  - minimum observation window: 4–12 weeks
  - human review: required
  - automation: recommend only
  - audit record: required
  - rollback: revert to active

- **active → demoted/paused**
  - sustained duplication + falling relevance
  - excessive noise burden
  - access instability or unresolved terms risk
  - poor downstream usefulness

  - required evidence: sustained duplication/noise/access failures
  - minimum observation window: 2–6 weeks (unless immediate legal/terms incident)
  - human review: required for permanent demotion; emergency pause may be policy-authorized
  - automation: recommend only; emergency pause requires explicit rule
  - audit record: required
  - rollback: restore previous state after review

- **paused → active**
  - access restored and terms risk addressed
  - renewed unique value hypothesis

  - required evidence: access restored + legal posture approved
  - minimum observation window: 1–2 weeks re-trial or explicit waiver
  - human review: required
  - automation: recommend only
  - audit record: required
  - rollback: pause again

- **active → retired**
  - persistently low decision usefulness
  - superior replacement exists
  - unacceptable legal/access risk
  - no longer relevant to monitored domains

  - required evidence: persistently low decision usefulness OR unacceptable legal risk
  - minimum observation window: 8–16 weeks unless legal incident
  - human review: required
  - automation: recommend only
  - audit record: required
  - rollback: demote to paused if decision reversed

- **retired → replaced**
  - replacement source_id documented and validated

  - required evidence: replacement provides superior coverage with compliant access
  - minimum observation window: replacement trial window complete
  - human review: required
  - automation: recommend only
  - audit record: required
  - rollback: restore retired source to paused for reassessment

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
