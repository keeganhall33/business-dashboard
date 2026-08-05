# Finding: A6 SECURITY DEFINER RPCs use unqualified pgcrypto digest() under search_path=public

## Summary
Production catalogs confirm pgcrypto is installed under the `extensions` schema. Under a constrained `search_path = public`, unqualified `digest(...)` does **not** resolve, while `extensions.digest(...)` does.

This mirrors the proven B3 lock-acquire outage root cause (`gen_random_bytes` resolution) and suggests the A6 transaction RPCs may have the same schema-resolution defect.

This document is a tracked finding only. **No remediation is included in the B3.2 lock migration.**

## Evidence (read-only)
- pgcrypto installed schema: `extensions`
- `to_regprocedure('digest(text,text)')` under `search_path=public` → NULL
- `to_regprocedure('extensions.digest(text,text)')` under `search_path=public` → resolves

## Affected repo definitions
- Migration: `supabase/migrations/20260804_external_intelligence_phase_a6_transaction_rpcs.sql`
  - uses `digest(..., 'sha256')` for deterministic provenance edge IDs
- Schema mirror: `supabase/schema.sql`
  - includes the same `digest(..., 'sha256')` expressions

## Affected RPC names (public schema)
(These functions exist in production.)
- `persist_external_claim_v1(...)`
- `persist_external_evidence_reference_v1(...)`
- `persist_external_signal_write_set_v1(...)`

## Risk
If these SECURITY DEFINER RPCs execute with `set search_path to 'public'` (as the migration header suggests), any unqualified `digest(...)` invocation will likely fail with a PostgreSQL 42883 resolution error.

## Unknowns (requires further read-only inspection)
- Whether each A6 RPC explicitly sets `search_path` to `public` in its final production definition.
- Whether these RPCs have executed successfully in production (would require checking run logs / dependent tables; do not mutate).

## Scope guard
- Do not fix this as part of the B3.2 lock remediation.
- Address via a separate dedicated migration + tests after confirming the production function bodies.
