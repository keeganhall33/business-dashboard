# Signal Engine V1 (Architecture)

**Milestone:** SIGNAL ENGINE V1 (architecture only)

The Signal Engine is the canonical interpretation layer that converts raw external **Evidence References** into normalized, explainable, auditable **External Signals**.

It sits between:

**Source Registry / Source Sets / Evidence References**

and

**Entities / Events / Relationships / Trends / External Findings / Opportunities / Risks / Strategic World Model / Fusion Context**.

**Non-goals (explicit):**
- No ingestion adapters.
- No crawlers/scraping.
- No external APIs.
- No scheduler jobs.
- No database migrations.
- No production code.
- No UI.
- No Strategic World Model persistence.
- No live source scoring.

---

## 1) Canonical distinctions (do not collapse these)

Each object below has a distinct meaning and allowed transitions.

- **Source**: a real-world publisher/provider/system.
- **Source Record**: the registry entry that defines identity, legality, outputs, and governance for a Source.
- **Source Set**: a governed collection of Sources with caps, membership rules, and member disablement.
- **Evidence Reference**: pointer to retrieved artifact (URL/id/hash + timestamps + terms context).
- **Claim**: an extracted atomic assertion from evidence (subject–predicate–object + time + verification state).
- **Signal**: a normalized, deduped external observation derived from one or more claims, with explicit uncertainty and history.
- **Event**: a time-bounded occurrence that changes state (may be referenced by Signals).
- **Relationship**: a typed edge between entities with strength and validity window (may be asserted/updated by Signals).
- **Trend**: a time-series or directional observation over a window (may be derived from Signals).
- **External Finding**: a cross-signal conclusion stronger than any single Signal (not created by the Signal Engine).
- **Opportunity**: a hypothesis-backed, time-bounded claim that a valuable action may exist (not created by the Signal Engine).
- **Risk**: a time-bounded negative scenario affecting decisions (not created by the Signal Engine).
- **Fusion Candidate**: a decision object produced by Fusion from internal + external context (not created by the Signal Engine).
- **Fusion Context**: external state/context passed to Fusion (signals/findings/trends), not a recommendation.

**Boundary:** the Signal Engine interprets evidence and produces Signals. It does not produce Opportunities, Recommendations, or Actions.

---

## 2) Canonical ExternalSignal contract

Every field is marked as **Required / Optional / Derived / Learned / Future**.

### 2.1 Identity and versioning
- `signal_id` **(Derived)**: stable id derived from `signal_fingerprint` (deterministic)
- `signal_schema_version` **(Required)**
- `signal_policy_version` **(Required)**
- `signal_fingerprint` **(Derived)**

- `created_at` **(Derived)**
- `updated_at` **(Derived)**
- `first_observed_at` **(Derived)**
- `last_observed_at` **(Derived)**

- `lifecycle_status` **(Required)**: candidate | active | corroborated | contradicted | under_review | updated | superseded | expired | invalidated | archived
- `supersedes_signal_ids[]` **(Optional)**
- `superseded_by_signal_id` **(Optional)**

### 2.2 Classification
- `signal_type` **(Required)** (what kind of thing it is): verified_event | market_observation | trend_signal | policy_change | rumor | correction | retraction
- `signal_classification` **(Required)** (how to treat it): official | independently_reported | single_source | developing | rumor | corrected | retracted

- `business_domains[]` **(Required)**
- `affected_entities[]` **(Required)** (canonical entity references)
- `affected_markets[]` **(Optional)** (segments/channels/geographies)
- `geography` **(Optional)**
- `languages[]` **(Optional)**

- `source_ids[]` **(Required)**
- `source_set_ids[]` **(Optional)**
- `evidence_reference_ids[]` **(Required)**
- `claim_ids[]` **(Required)**

- `event_ids[]` **(Optional)**
- `relationship_ids[]` **(Optional)**
- `trend_ids[]` **(Optional)**

### 2.3 Interpretation
- `normalized_statement` **(Required)**: concise canonical statement
- `observed_fact` **(Required)**: what is directly asserted/observed
- `inferred_interpretation` **(Optional)**: explicit, labeled interpretation hypothesis (non-causal by default)

- `expected_business_mechanism` **(Optional)**
- `internal_business_relevance` **(Optional)** (why it matters to this business)
- `strategic_fit` **(Optional)** (premium/scarcity compatibility hypothesis)
- `opportunity_relevance` **(Optional)**
- `risk_relevance` **(Optional)**

- `novelty` **(Derived/Future)**
- `urgency` **(Derived/Optional)**
- `expiration` **(Derived/Required)** (computed from type + window)
- `review_by` **(Derived/Optional)**

### 2.4 Evidence and uncertainty
- `supporting_evidence[]` **(Required)**: list of evidence refs + claim refs
- `contradicting_evidence[]` **(Optional)**
- `missing_evidence[]` **(Optional)**

- `corroboration_count` **(Derived)**
- `independent_source_count` **(Derived)**

- `source_credibility_summary` **(Derived)**
- `signal_credibility` **(Required)**: item-level credibility assessment
- `confidence` **(Required)**: multi-axis confidence object (see §6)
- `uncertainty_reasons[]` **(Required)**

- `what_would_strengthen[]` **(Optional)**
- `what_would_weaken[]` **(Optional)**
- `what_would_invalidate[]` **(Optional)**

### 2.5 Lifecycle and disposition
- `disposition` **(Required)**: suppress | archive_only | monitor | validate | escalate_to_external_finding | escalate_to_opportunity | send_to_fusion_context
- `disposition_reason_codes[]` **(Required)**

- `escalation_eligibility` **(Derived)**
- `fusion_eligibility` **(Derived)**

- `monitoring_cadence` **(Optional)**
- `relevance_expires_at` **(Derived)**
- `archived_at` **(Optional)**

### 2.6 Audit and future learning
- `extraction_method` **(Required)**: deterministic | ai_assisted | human
- `deterministic_rules_applied[]` **(Optional)**
- `llm_assistance_used` **(Optional)**
- `model_version` **(Optional)**
- `prompt_version` **(Optional)**
- `human_review_status` **(Optional)**

- `correction_history[]` **(Derived)**
- `attribution_links[]` **(Future)**

---

## 3) Claim model (canonical)

Claims are atomic assertions extracted from Evidence References.

**ClaimContract** (Required unless noted):
- `claim_id` **(Derived)**
- `evidence_reference_id` **(Required)**
- `subject_entity_id` **(Optional)** (nullable if ambiguous)
- `predicate` **(Required)**
- `object_entity_id` **(Optional)**
- `object_literal` **(Optional)** (one of object_entity_id or object_literal must be present)

- `event_time` **(Optional)**
- `announcement_time` **(Optional)**
- `retrieved_at` **(Required)**

- `claim_classification` **(Required)**
- `observed_vs_inferred` **(Required)**: observed | inferred
- `verification_state` **(Required)**: unverified | developing | corroborated | contradicted | corrected | retracted

- `source_credibility` **(Derived)** (from Source Registry)
- `extraction_confidence` **(Required)**
- `contradiction_state` **(Optional)**
- `correction_state` **(Optional)**

- `relevance_window` **(Required)**
- `claim_fingerprint` **(Derived)**

**Rule:** an Evidence Reference can yield multiple Claims. Claims can contribute to multiple Signals.

---

## 4) Evidence aggregation model

### 4.1 Aggregation into a Signal
A Signal aggregates:
- one or more Evidence References
- one or more Claims
- with explicit independence/corroboration accounting

Aggregation must preserve:
- every source
- every claim
- first detection time
- later confirmations
- independence
- syndicated duplication
- updates/corrections/retractions
- contradictions and disagreement
- historical versions

### 4.2 Independence vs syndication (non-negotiable)
Do not count syndicated copies as independent corroboration.

Independence heuristics (deterministic features):
- original publisher identity (registry)
- wire-service origin
- identical/near-identical wording hashes
- timestamp proximity
- explicit citation links (“according to X”)
- source ownership relationships (same parent)

---

## 5) Source credibility vs Signal credibility

- **Source credibility**: historical provider reliability (registry-level).
- **Signal credibility**: confidence in this specific interpretation.

Signal credibility considers:
- source credibility
- primary vs secondary evidence
- independent sources count
- official confirmation
- claim consistency
- contradiction severity
- extraction certainty
- freshness
- specificity
- correction history

Rule: source score can influence priors, but cannot make a signal actionable by itself.

---

## 6) Signal confidence model (multi-axis)

Confidence must be explainable. Use bounded levels; avoid fabricated probabilities.

**ConfidenceAxes** (Required):
- `evidence_confidence` (level + reasons + blockers)
- `interpretation_confidence` (level + reasons + blockers)
- `business_relevance_confidence`
- `mechanism_confidence`
- `timing_confidence`
- `overall` (derived)

Each axis includes:
- `level` (known | likely | possible | rumor | speculation)
- `reasons[]`
- `blockers[]`
- `supporting_evidence_ids[]`
- `contradicting_evidence_ids[]`
- `missing_evidence[]`

---

## 7) Contradiction model

Contradictions are preserved; never deleted.

Represent:
- direct contradiction
- partial contradiction
- later correction
- retraction
- source disagreement
- interpretation disagreement
- stale evidence
- regime change

Contradictions affect:
- confidence
- lifecycle status
- disposition
- escalation eligibility
- downstream Findings/Opportunities
- Fusion eligibility

Contradiction actions:
- weaken
- suspend (under_review)
- invalidate
- supersede
- archive

---

## 8) Signal lifecycle (history-preserving)

Canonical lifecycle:
- candidate
- active
- corroborated
- contradicted
- under_review
- updated
- superseded
- expired
- invalidated
- archived

For each transition define:
- trigger
- required evidence
- deterministic vs human-reviewed
- allowed next states
- history preserved (append-only)
- downstream propagation
- rollback/correction behavior

---

## 9) Disposition model (with guardrails)

Dispositions:
- suppress
- archive_only
- monitor
- validate
- escalate_to_external_finding
- escalate_to_opportunity
- send_to_fusion_context

Rules:
- popularity alone is insufficient
- rumor remains monitor-only
- one weak signal cannot create an operating recommendation
- multiple weak signals may combine only when linked by credible entities/relationships/mechanisms
- licensing infeasibility blocks actionability

---

## 10) Deduplication and fingerprinting

Deterministic `signal_fingerprint` uses normalized:
- subject entities
- signal type
- core claim
- event window
- affected domain
- mechanism hypothesis (if present)
- geography

Rules:
- exact duplicates → merge evidence, keep one Signal
- syndicated duplicates → merge evidence, do not increase independent count
- near-duplicates → update or link via supersedes
- updates/corrections → versioned update; may supersede
- distinct interpretations → separate Signals with explicit labels

---

## 11) Update and merge behavior

When new evidence arrives, choose:
- update (same signal_id)
- strengthen/weaken (confidence)
- split (divergent interpretations)
- merge (duplicate)
- supersede
- invalidate
- archive

All changes append to correction/history. No destructive overwrite.

---

## 12) Breaking-news handling

Breaking-news states:
- unverified_report
- developing
- independently_reported
- officially_confirmed
- corrected
- retracted
- resolved

Urgency may increase review cadence but cannot lower evidence standards.

---

## 13) Expiration and temporal relevance

Expiration removes active influence without deleting history.

Expiration drivers:
- signal type and event time
- commercial window / seasonal relevance
- platform policy replacement
- licensing availability
- superseding evidence

---

## 14) Cross-domain boundary (Signal vs Finding vs Opportunity)

- Signal Engine: interprets evidence into normalized Signals.
- External Finding Engine: combines Signals into conclusions.
- Opportunity Engine: evaluates business action potential.
- Fusion: chooses among competing opportunities + internal candidates.

Signal Engine must not create final Opportunities.

---

## 15) Deterministic vs AI responsibilities

Deterministic responsibilities:
- source eligibility + legal/access enforcement
- claim fingerprinting
- independence detection
- deduplication
- time calculations
- lifecycle transitions
- contradiction propagation
- confidence feature calculation
- disposition eligibility
- persistence + versioning + audit history

AI-assisted responsibilities (schema-constrained):
- claim extraction candidates
- entity-linking suggestions
- concise normalized statements
- mechanism hypotheses
- relevance hypotheses
- contradiction summaries
- missing-evidence suggestions

AI must never:
- invent claims or evidence
- fabricate corroboration
- override legal restrictions
- silently merge distinct events
- convert rumor into fact
- escalate directly to a recommendation
- claim causality

---

## 16) Persistence and auditability (minimum design)

Durable storage must support:
- signal records
- signal versions (append-only)
- claims
- claim↔evidence links
- signal↔claim links
- contradictions/corrections/retractions
- lifecycle transitions
- dispositions
- human reviews
- source contribution links
- downstream finding/opportunity links

Do not rely on job logs as the only store.

---

## 17) Versioning

Each Signal references:
- signal schema version
- interpretation policy version
- confidence policy version
- disposition policy version
- extraction model + prompt versions
- entity-resolution version
- source registry version
- legal-policy version

---

## 18) Testing strategy (future)

Require tests for:
- parsing + rejection
- dedupe + syndication
- corroboration counting
- contradiction handling
- correction/retraction propagation
- lifecycle transitions + expiration
- deterministic fingerprinting
- update vs new-signal behavior
- historical reconstruction
- source score vs signal score separation
- rumor not becoming actionable
- popularity not promoting
- legal/access fail-closed
- AI introduces no unsupported claims

---

## 19) Implementation roadmap (future; no implementation now)

Phase A: contracts + fingerprints + claim/evidence linkage + lifecycle/versioning + persistence.

Phase B: deterministic official-source signals (1–2 Wave 1 sources; no LLM).

Phase C: AI-assisted claim extraction behind strict schema validation.

Phase D: contradiction/correction handling + integration with External Finding layer.

---

## 20) Explicit exclusions

Signal Engine V1 architecture does not implement:
- source ingestion
- crawling/scraping
- live APIs
- scheduler jobs
- Strategic World Model
- External Finding Engine
- Opportunity Engine
- Fusion candidates
- recommendations/actions
- outcome learning
- UI
