# Configuration Foundation (Architecture)

**Milestone:** Configuration Foundation (final prerequisite before Phase A implementation)

This document defines the canonical **version-controlled configuration** layout and rules that Phase A will consume.

**Scope:** configuration + documentation only.
- No code.
- No validators.
- No adapters.
- No migrations.
- No ingestion.

---

## 1) Repository layout (canonical)

### 1.1 Source Registry

```
config/source-registry/v1/
  source_registry.json
  source_sets.json
```

### 1.2 Policy Registry

```
config/policies/
  README.md
  confidence/v1.0.0.json
  disposition/v1.0.0.json
  lifecycle/v1.0.0.json
  signal-interpretation/v1.0.0.json
```

**Rule:** policies are stored under:

```
config/policies/<policy_name>/<semantic_version>.json
```

### 1.3 Strategic constraints

Existing canonical strategic constraints remain at:

```
config/strategic_constraints_v1.json
```

---

## 2) Configuration loading order (deterministic)

1) Load **Source Registry** (`config/source-registry/v1/source_registry.json`)
2) Load **Source Sets** (`config/source-registry/v1/source_sets.json`)
3) Load **Policy files** referenced by PolicyRef (from `config/policies/**`)
4) Load **strategic constraints** (`config/strategic_constraints_v1.json`) for Fusion

**Fail-closed:** if any required config file is missing, malformed, or references a missing policy version → the system must not proceed beyond architecture fixtures.

---

## 3) Precedence rules

- Source Registry config is source-of-truth for:
  - identity (`source_id`)
  - legal/access classification
  - enabled state and wave
  - credibility prior
- Policies are source-of-truth for:
  - confidence axes requirements
  - lifecycle/disposition eligibility gates
  - interpretation fingerprint inputs
- Runtime behavior must be pinned to the exact PolicyRef + content hash.

---

## 4) Semantic versioning policy

- Policy versions use semantic versioning: `vMAJOR.MINOR.PATCH`
- Any meaning-changing policy update must bump MINOR or MAJOR.
- Any behavior-breaking update must bump MAJOR.

---

## 5) content_hash generation (canonical)

`content_hash` is SHA-256 hex of the **canonical JSON serialization** of the policy file.

Canonical JSON rules:
- recursively sort object keys
- preserve array order
- normalize non-finite numbers to null (if present)

Array semantics:
- **ordered arrays** preserve order (e.g., lifecycle state lists)
- **set-like arrays** must be sorted before hashing to avoid semantic drift (e.g., domains, required_axes, dispositions)

Operational timestamp rule:
- Policy metadata fields like `changed_at` must be **null** (or otherwise excluded by policy) in fixtures so hashes are not contaminated by non-semantic timestamps.

---

## 6) Fail-closed behavior (required)

- Unknown enum value → fail closed
- Missing required file → fail closed
- Missing required PolicyRef target file → fail closed
- Hash mismatch (computed vs recorded) → fail closed
- Legal/access classification prohibits automation → must block automation paths (future) and allow only manual-only behaviors

---

## 7) Immutability requirements

- Configuration files are version-controlled.
- EvidenceReference objects are immutable after creation (append-only supersession for corrections).
- VersionRefs must pin immutable `content_hash` identities.

---

## 8) Deprecation and backward compatibility

- Deprecated policy versions remain in repo for historical reconstruction.
- Backward compatibility is handled by:
  - explicit adapters (future)
  - explicit mapping tables
  - never by silent fallback.

---

## 9) Migration/version upgrade policy

- Upgrades happen by:
  - adding a new semantic policy file
  - selecting it via config/PolicyRef
- Rollback is selecting the prior approved PolicyRef.
- No destructive rewrites of historical configuration.

---

## 10) Historical reconstruction requirements

To reconstruct any decision or state:
- all PolicyRefs (semantic version + content_hash) must remain available
- Source Registry versions must be preserved
- VersionRef pinning must be sufficient to rebuild the exact chain:
  Evidence → Claims → Signals → Synthesis → Findings/Hypotheses → World Model → FusionContext

---

## 11) Testing expectations for configuration artifacts

Phase A must include tests that:
- parse these config files
- reject malformed or unknown enums
- compute deterministic content hashes
- confirm fail-closed behavior on missing files
- confirm that downstream objects cannot reference id-only (must use VersionRef)

---

## 12) Fixture vs production distinction

These artifacts are **architecture fixtures**, not production configuration.

All fixture files must include explicit markers:
- `fixture_status: "architecture_fixture"`
- `production_eligibility: "disabled"`

Source Registry fixtures must default safe:
- `enabled = false`
- `enabled_by_default = false`
- `lifecycle_status = proposed` (or trial)
- `implementation_status = unimplemented`
