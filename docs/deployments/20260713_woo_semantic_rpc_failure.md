# 2026-07-13 Production Install Attempt – Semantic RPC

- **UTC attempt time:** 2026-07-13 20:56:18 UTC
- **Supabase project:** `ibjsjosplgbqevmnvvpf`
- **Database role:** `postgres`
- **PostgreSQL version:** `17.6 on aarch64-unknown-linux-gnu`
- **Installation artifact:** `supabase/deployment/20260713_install_woo_semantic_rpc.sql`
  - SHA-256: `3ff2294a96d9d6fe578f1c43396e77d16ca36753fab6e21c1a67da5a3e77463a`
- **Outcome:** FAIL (syntax error)
  - Error: `syntax error at or near "WITH"` triggered by the `RETURN WITH ...` clause.
  - Transaction aborted immediately; no objects were created.
  - Post-check (`to_regprocedure`): `NULL` (semantic RPC absent).
  - Shadow validation: _not run_.
  - Rollback: _not required_ (no changes to undo).
- **Evidence log:** `supabase/deployment/logs/20260713_install.log`
  - SHA-256: `7087d6e812cdc3b795ad9ae3afee7c56d0874d4e6b202a756df15374f8073e2f`
- **Next steps:** refactor PL/pgSQL return handling, add regression harness that applies the migration to a local PostgreSQL instance, regenerate deployment artifacts, and re-seek production approval.
