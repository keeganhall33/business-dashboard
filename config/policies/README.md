# Policy Registry (config/policies)

This directory contains **version-controlled policy artifacts** referenced by the intelligence architecture.

## Contract
Each policy file corresponds to a **PolicyRef**:
- `policy_name`
- `semantic_version`
- `content_hash`
- `effective_from`
- `effective_until` (nullable)
- `approval_status`
- `approved_by` (nullable)
- `changed_at`
- `change_reason`

## Layout
Policies live under:

```
config/policies/<policy_name>/<semantic_version>.json
```

## Hashing rule
`content_hash` must be the SHA-256 hex of the **canonical JSON serialization** of the policy file.

Canonical JSON rules:
- sort object keys recursively
- preserve array order
- normalize `undefined` → `null` (if applicable)
- JSON stringify

## Scope
These are **architecture fixtures** in early milestones.
They must remain safe defaults and must not embed production credentials, ingestion endpoints, or operational secrets.
