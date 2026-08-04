# Knowledge Synthesis Engine V1 (Architecture)

**Milestone:** KNOWLEDGE SYNTHESIS ENGINE V1 (architecture only)

The Knowledge Synthesis Engine (KSE) is the canonical layer that converts many **External Signals** (already interpreted from Evidence→Claims→Signals) into durable, reconciled **Knowledge Objects** that downstream decision systems can trust.

It sits between:

**Signals (from Signal Engine V1)**

and

**External Findings / Hypotheses / Risks / Opportunity candidates / Strategic World Model updates / Fusion Context**.

**Primary purpose:** ensure that downstream reasoning (especially Fusion) never operates directly on raw Signals.

## Boundary reminder (non-negotiable)

KSE is **not** a decision engine.

- **Signal Engine answers:** “What happened?”
- **Knowledge Synthesis Engine answers:** “What does all of this collectively tell us?”
- **Strategic World Model answers:** “What do we currently believe to be true?”
- **Fusion answers:** “Given what we know, what should we do?”

KSE must never:
- prioritize actions
- rank opportunities
- recommend actions
- compare business initiatives
- optimize ROI
- choose among alternatives
- execute strategic reasoning that belongs in Fusion

**Non-goals (explicit):**
- No ingestion/adapters/crawlers/scraping.
- No external APIs.
- No scheduler jobs.
- No database migrations.
- No production code.
- No UI.
- No persistence implementation.

---

## 1) Canonical pipeline (hard boundary)

**Source Registry → Evidence References → Claims → Signals → Knowledge Synthesis → Findings/Hypotheses/Risks → Opportunities → Strategic World Model → Fusion**

**Invariant:** Fusion must consume **synthesized knowledge** (Findings/Hypotheses/Risks + versioned context), not raw Signals.

**Invariant:** KSE outputs are *knowledge*, not *choices*. Any prioritization/ranking/selection remains a Fusion concern.

---

## 2) Canonical distinctions (do not collapse)

This layer introduces *explicit* reasoning objects so “External Finding” is not an implicit blob.

- **Signal**: a normalized observation derived from claims; may be weak/incorrect; carries contradictions and confidence.
- **Finding**: a cross-signal conclusion about the external world that is stronger than any single Signal, but not an Opportunity.
- **Hypothesis**: a falsifiable explanatory or predictive statement generated from one+ Signals/Findings; explicitly uncertain.
- **Risk**: a time-bounded downside scenario (may be derived from Findings + hypotheses).
- **Opportunity Emergence Candidate**: a non-actionable “candidate opportunity condition” produced by synthesis (not a full Opportunity).
- **Strategic World Model update candidate**: a proposed durable world-state change, gated by policy.
- **Fusion Context**: the curated set of synthesized objects Fusion is permitted to use.

**Boundary:** KSE may **synthesize** and **explain**; it may not recommend actions or choose winners.

---

## 3) Contracts (implementation-ready; field classifications)

Each contract is marked **Required / Optional / Derived / Learned / Future**.

### 3.0 Synthesis coordination + provenance objects (required)

These objects exist to guarantee **reproducibility**, **version pinning**, and a complete provenance chain.

> Reuse/adaptation note: this architecture reuses the canonical meanings of **Evidence Reference**, **Claim**, and **Signal** from the existing Knowledge + Signal Engine architecture. It does **not** introduce parallel Evidence/Claim/Signal contracts.

#### 3.0.1 SynthesisInput

A deterministic snapshot of what the synthesis run consumed.

- `synthesis_input_id` **(Derived)** (from `synthesis_input_fingerprint`)
- `synthesis_input_fingerprint` **(Derived)**
- `signal_refs[]` **(Required)**: `{ signal_id, signal_version_ref }`
- `window_start` / `window_end` **(Required)**

- `entity_resolution_version` **(Required)**
- `source_registry_version` **(Required)**
- `legal_policy_version` **(Required)**
- `synthesis_policy_version` **(Required)**
- `confidence_policy_version` **(Required)**
- `contradiction_policy_version` **(Required)**

- `created_at` **(Derived)**

#### 3.0.2 EvidenceEdge (for audit graph)

An explicit, typed link in the provenance chain.

- `evidence_edge_id` **(Derived)**
- `edge_type` **(Required)**: evidence_to_claim | claim_to_signal | signal_to_finding | finding_to_hypothesis
- `from_id` **(Required)**
- `to_id` **(Required)**
- `from_version_ref` **(Optional/Future)**
- `to_version_ref` **(Optional/Future)**
- `created_at` **(Derived)**

#### 3.0.3 Contradiction (synthesis-level)

Contradictions are first-class and preserved.

- `contradiction_id` **(Derived)**
- `contradiction_type` **(Required)**: direct | partial | source_disagreement | interpretation_disagreement | correction | retraction | stale | regime_change
- `severity` **(Required)**: low | medium | high
- `supporting_signal_refs[]` **(Required)**
- `contradicting_signal_refs[]` **(Required)**
- `summary` **(Required)** (observed vs inferred clearly labeled)
- `created_at` **(Derived)**

#### 3.0.4 MissingEvidenceItem

A structured representation of what would strengthen/weaken/invalidate synthesis.

- `missing_evidence_id` **(Derived)**
- `missing_type` **(Required)**: official_confirmation | independent_corroboration | primary_document | terms_detail | timestamp | entity_disambiguation | outcome_measurement
- `requested_for` **(Required)**: finding_id | hypothesis_id
- `why_needed` **(Required)**
- `priority` **(Optional)** (informational only; not business ranking)
- `expires_at` **(Derived/Optional)**

#### 3.0.5 SynthesisReasoningTrace

An append-only trace of deterministic rules applied (and any AI-assisted steps) that produced a Finding/Hypothesis.

- `reasoning_trace_id` **(Derived)**
- `synthesis_input_id` **(Required)**
- `deterministic_steps[]` **(Required)**: `{ step_id, step_type, inputs, outputs, rule_version }`
- `ai_steps[]` **(Optional)**: `{ step_id, prompt_version, model_version, output_hash }`
- `created_at` **(Derived)**

#### 3.0.6 FindingVersion

A version wrapper so downstream systems can pin exact Finding state.

- `finding_id` **(Required)**
- `finding_version_ref` **(Required/Future)** (monotonic int or content hash)
- `finding_schema_version` **(Required)**
- `created_at` **(Derived)**
- `supersedes_finding_version_refs[]` **(Optional/Future)**

#### 3.0.7 SynthesisRun

The run envelope that produced one or more Findings/Hypotheses.

- `synthesis_run_id` **(Derived)**
- `synthesis_input_id` **(Required)**
- `run_started_at` / `run_completed_at` **(Derived)**
- `produced_finding_ids[]` **(Derived)**
- `produced_hypothesis_ids[]` **(Derived)**
- `policy_versions` **(Required)** (all versions listed in SynthesisInput)
- `errors[]` **(Optional)**
- `created_at` **(Derived)**

### 3.1 ExternalFinding (synthesized)

- `external_finding_id` **(Derived)** (from `finding_fingerprint`)
- `finding_schema_version` **(Required)**
- `finding_policy_version` **(Required)**
- `confidence_policy_version` **(Required)**
- `synthesis_policy_version` **(Required)**
- `legal_policy_version` **(Required)**
- `entity_resolution_version` **(Required)**

- `finding_fingerprint` **(Derived)**
- `created_at` **(Derived)**
- `updated_at` **(Derived)**

- `lifecycle_status` **(Required)**: candidate | active | corroborated | contradicted | under_review | updated | superseded | expired | invalidated | archived
- `supersedes_finding_ids[]` **(Optional)**
- `superseded_by_finding_id` **(Optional)**

**Classification**
- `finding_type` **(Required)**: market_shift | competitor_move | licensing_shift | demand_shift | supply_shift | sentiment_shift | policy_shift | cultural_shift | pricing_shift
- `business_domains[]` **(Required)**
- `affected_entities[]` **(Required)**
- `affected_markets[]` **(Optional)**
- `geography` **(Optional)**
- `languages[]` **(Optional)**

**Synthesis**
- `normalized_conclusion` **(Required)** (concise)
- `observed_basis` **(Required)** (what the Signals/Claims directly support)
- `inferred_interpretation` **(Optional)** (explicit, labeled)
- `expected_business_mechanism` **(Optional)**

**Evidence + uncertainty**
- `supporting_signal_ids[]` **(Required)**
- `supporting_signal_versions[]` **(Required/Future)** (pin exact versions)
- `contradicting_signal_ids[]` **(Optional)**
- `missing_evidence[]` **(Optional)**

- `independent_source_count` **(Derived)** (aggregated; deduped)
- `corroboration_summary` **(Derived)**
- `contradiction_summary` **(Derived)**

- `confidence` **(Required)** (multi-axis; see §6)
- `uncertainty_reasons[]` **(Required)**

**Temporal**
- `window_start` **(Required)**
- `window_end` **(Required)**
- `relevance_expires_at` **(Derived)**

**Downstream links (non-recommendation)**
- `hypothesis_ids[]` **(Optional)**
- `risk_ids[]` **(Optional)**
- `opportunity_emergence_candidate_ids[]` **(Optional)**
- `world_model_update_candidate_ids[]` **(Optional)**

**Audit**
- `synthesis_method` **(Required)**: deterministic | ai_assisted | human
- `deterministic_rules_applied[]` **(Optional)**
- `llm_assistance_used` **(Optional)**
- `model_version` **(Optional)**
- `prompt_version` **(Optional)**
- `human_review_status` **(Optional)**
- `correction_history[]` **(Derived)**

### 3.1.1 Finding explanation bundle (Required)

Every Finding must explicitly answer:
- **What do we believe?** (`normalized_conclusion`)
- **Why do we believe it?** (`observed_basis` + linked supporting signals)
- **What contradicts it?** (`contradicting_signal_ids[]` + `contradiction_summary`)
- **What evidence is still missing?** (`missing_evidence[]`)
- **What would increase confidence?** (Derived from `missing_evidence` + corroboration gaps)
- **What would invalidate it?** (encoded via hypothesis invalidation conditions and/or finding correction rules)

These answers must be reproducible given pinned inputs + policy versions.

### 3.2 Hypothesis (falsifiable)

- `hypothesis_id` **(Derived)**
- `hypothesis_schema_version` **(Required)**
- `hypothesis_policy_version` **(Required)**

- `hypothesis_type` **(Required)**: explanatory | predictive | causal_candidate
- `statement` **(Required)** (must be falsifiable)
- `scope` **(Required)** (entities/domains/markets)
- `window_start` **(Required)**
- `window_end` **(Required)**

- `supported_by_finding_ids[]` **(Optional)**
- `supported_by_signal_ids[]` **(Optional)**
- `contradicted_by_signal_ids[]` **(Optional)**

- `confidence` **(Required)** (multi-axis)
- `what_must_be_true[]` **(Required)**
- `missing_evidence[]` **(Required)**
- `invalidation_conditions[]` **(Required)**

- `lifecycle_status` **(Required)**: proposed | active | under_review | weakened | invalidated | confirmed | expired | archived
- `correction_history[]` **(Derived)**

### 3.3 OpportunityEmergenceCandidate (non-actionable)

This object exists to prevent KSE from creating full Opportunities while still allowing synthesis to surface “conditions worth evaluating.”

- `oec_id` **(Derived)**
- `oec_schema_version` **(Required)**
- `candidate_statement` **(Required)**
- `triggering_finding_ids[]` **(Required)**
- `supporting_signal_ids[]` **(Required)**
- `blockers[]` **(Required)** (especially licensing feasibility unknown/blocked)
- `recommended_next_evidence[]` **(Optional)**
- `eligibility` **(Derived)**: cannot_create_opportunity | may_request_opportunity_review
- `expires_at` **(Derived)**

### 3.4 WorldModelUpdateCandidate (state-change proposal)

- `wmuc_id` **(Derived)**
- `proposed_update_type` **(Required)**: entity_create | entity_attribute_update | event_create | relationship_update | trend_update | policy_state_update
- `target_ids[]` **(Optional)**
- `proposed_patch` **(Required/Future)** (structured patch)
- `supporting_signal_ids[]` **(Required)**
- `confidence_gate` **(Required)**
- `human_approval_required` **(Derived)**
- `approved_at` **(Optional)**
- `rejected_at` **(Optional)**

---

## 4) How Signals combine into Findings (synthesis model)

### 4.1 Inputs
KSE consumes:
- Signals (and pinned versions)
- Signal confidence + contradiction structures
- Source Registry credibility priors (indirectly via Signal summaries)
- Canonical entity graph identifiers

### 4.2 Deterministic grouping keys
Group Signals into candidate Finding clusters using deterministic features:
- shared affected entities
- compatible `signal_type` families (e.g., demand signals vs policy signals)
- aligned time windows
- shared mechanism candidates (if present, but non-binding)
- geography/market overlap

### 4.3 Synthesis outputs
For each cluster, produce:
- a Finding conclusion (observed basis + inferred interpretation)
- an explicit uncertainty record
- a confidence object
- explicit contradiction handling (see §7)

**Rule:** no Finding may be created without at least one Signal that itself is traceable to Claims and Evidence References.

### 4.4 Reproducibility requirement (deterministic Findings)

Every Finding must be reproducible.

Given the same:
- input **Signal ids + exact Signal versions**
- policy versions (synthesis + confidence + legal + entity resolution)
- deterministic clustering/fingerprinting rules

the system must deterministically recreate the exact same:
- `finding_fingerprint`
- `external_finding_id`
- `normalized_conclusion` and `observed_basis` (when generated deterministically)
- confidence features and lifecycle state transitions

If any AI assistance was used for summarization, the Finding must store:
- the AI output artifact hash (Future)
- the prompt/model versions

and still remain reconstructable as an *auditable* transformation from the pinned input set.

---

## 5) Graph reasoning (non-causal by default)

KSE may reason over the graph to:
- connect Signals through shared entities/events/relationships
- identify gaps (“missing evidence”) needed to strengthen a Finding
- detect conflicting subgraphs (regime change, disagreement)

**Causal vs non-causal reasoning:**
- Default: **non-causal association** (“may be related”, “is consistent with”).
- Causal statements require explicit causal-evidence criteria (see §9).

---

## 6) Confidence accumulation and uncertainty propagation

KSE confidence is **not** a simple sum of Signal confidences.

### 6.1 Multi-axis Finding confidence
Finding confidence must include:
- `evidence_confidence`
- `synthesis_confidence` (did we combine correctly?)
- `mechanism_confidence`
- `business_relevance_confidence`
- `timing_confidence`
- `overall` (derived)

Each axis must include:
- bounded level
- reasons
- blockers
- supporting signals
- contradicting signals
- missing evidence

### 6.2 Uncertainty propagation
If any upstream Signal is:
- contradictory
- under_review
- corrected/retracted

Then the Finding must:
- inherit that uncertainty explicitly
- reduce confidence appropriately
- preserve the contradiction as first-class, never hidden

---

## 7) Contradiction resolution (preserve, don’t erase)

KSE must represent:
- direct contradiction (same claim, opposing values)
- partial contradiction (terms differ)
- source disagreement (credible sources differ)
- interpretation disagreement (same facts, different synthesis)
- stale evidence and regime change

**Resolution outcomes (non-destructive):**
- **weaken** a Finding
- **split** into multiple Findings (competing interpretations)
- **suspend** (under_review)
- **supersede** with a corrected Finding
- **invalidate** when an official retraction/conclusive refutation exists

**Rule:** contradictions are never deleted; they change lifecycle + confidence + downstream eligibility.

---

## 8) Temporal reasoning and regime changes

KSE must treat time as first-class:
- Findings have windows; they expire.
- Older signals can remain as historical context but must not drive current decisions.

**Regime change detection (architecture):**
- a shift where historical patterns no longer predict current outcomes
- a structural market change (platform policy, macro shock, licensing restrictions)

Regime change should:
- weaken or invalidate dependent hypotheses
- trigger re-synthesis of affected Findings
- force downstream review (Opportunity/Risk layers)

---

## 9) Causal vs non-causal reasoning (hard policy)

### 9.1 Allowed reasoning
- Association: entity/event co-occurrence
- Consistency: mechanism hypothesis consistent with evidence
- Temporal precedence: A preceded B (not causation)

### 9.2 Causal candidate constraints
A `causal_candidate` Hypothesis may be generated only when:
- mechanism is explicit
- alternative explanations are listed
- required evidence to distinguish alternatives is stated

KSE must never assert causality as fact.

---

## 10) Opportunity and risk emergence (boundary)

KSE may produce:
- Risks (as synthesized downside scenarios)
- OpportunityEmergenceCandidates (non-actionable)

KSE may not:
- create an Opportunity object
- recommend an action
- rank actions

Opportunity/Risk layers remain responsible for business evaluation.

---

## 11) Deterministic vs AI-assisted boundaries

### 11.1 Deterministic responsibilities
- cluster formation rules (grouping keys)
- contradiction detection features (identity, time, entity overlap)
- confidence feature calculation (counts, independence, freshness)
- lifecycle transitions and supersession links
- versioning and audit trail requirements
- legal/access policy enforcement

### 11.2 AI-assisted responsibilities (schema-constrained)
- propose candidate cluster labels (finding_type)
- draft `normalized_conclusion` and `observed_basis` summaries
- propose missing evidence
- propose alternative interpretations (explicitly labeled)
- propose hypothesis statements (must be falsifiable)

AI must never:
- fabricate new Signals/Claims
- change deterministic independence counts
- delete contradictions
- escalate to an Opportunity
- choose Fusion candidates

---

## 12) Explanation generation (auditable)

Every Finding/Hypothesis must have an explanation bundle:
- what is observed vs inferred
- which Signals (and versions) support it
- which Signals contradict it
- what evidence is missing
- why confidence has its value

Explanations must be reproducible given the same input versions + policy versions.

---

## 12.1 Provenance chain (required)

No Finding may exist without a complete provenance chain that can be traversed:

Evidence Reference → Claim(s) → Signal(s) → Synthesis reasoning → Finding

Minimum provenance links required:
- Finding → supporting Signal ids (+ pinned versions)
- Signal → Claim ids
- Claim → Evidence Reference id
- Evidence Reference → Source id

This provenance chain must be sufficient for a human to audit:
- what was observed
- what was inferred
- what was missing
- what contradicted

---

## 13) Versioning and auditability

Every synthesized object must reference:
- synthesis policy version
- confidence policy version
- disposition/eligibility policy version (if any)
- legal policy version
- entity-resolution version
- source registry version
- input Signal ids **and exact Signal versions** (future field)

**Audit invariant:** downstream consumers must be able to reconstruct exactly which Signal versions produced a given Finding/Hypothesis.

---

## 14) Testing strategy (future)

Require tests for:
- deterministic clustering reproducibility
- contradiction preservation and split/suspend behavior
- confidence accumulation (no naive summation)
- regime change propagation
- expiry removing active influence without erasing history
- AI output schema rejection
- AI cannot create opportunities or delete contradictions
- downstream pinning to exact Signal versions

---

## 15) Initial implementation sequence (future; no implementation now)

Phase A
- contracts only (Finding/Hypothesis/Risk/OEC/WModelUpdateCandidate)
- deterministic fingerprints + lifecycle/versioning

Phase B
- deterministic synthesis for a narrow set of signal types (official announcements + transaction results)
- no AI required

Phase C
- AI-assisted summarization + hypothesis proposals behind strict schema validation

Phase D
- integration with Opportunity/Risk engines and Strategic World Model update gating

---

## 16) Explicit exclusions

Knowledge Synthesis Engine V1 architecture does not implement:
- ingestion/collection
- crawling/scraping
- live APIs
- scheduler jobs
- persistence/migrations
- production code
- UI
- Opportunity Engine
- Fusion
- Strategic World Model persistence
