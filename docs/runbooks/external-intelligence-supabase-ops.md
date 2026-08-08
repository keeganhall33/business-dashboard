# External Intelligence — Supabase Ops (Production)

This runbook documents **safe production read paths** and **migration verification** for External Intelligence.

## Production project

- Production Supabase project ref: `ibjsjosplgbqevmnvvpf`
- Linked project ref file (local): `supabase/.temp/project-ref`

## Read-only production SQL (safe)

Use Supabase CLI’s linked connection (read-only queries you write):

```bash
supabase db query --linked "select now();"
```

Recommended: use `--output json` for deterministic machine-readable output.

```bash
supabase db query --linked --output json "select count(*)::int as claims from public.external_claims_v1;"
```

## Migration history / remote sync

Show local vs remote migration state:

```bash
supabase migration list --linked
```

Apply forward migrations to production (no repair):

```bash
supabase db push --linked
```

## 1Password (op) notes

Some operator scripts rely on `.env.*` files that contain `op://...` references.

If `op run` fails with `authorization timeout` or `account is not signed in`:

- Ensure 1Password desktop app is running and unlocked.
- Ensure CLI integration is enabled in 1Password.
- Verify with:

```bash
op whoami
```

Never paste secrets into logs or chat.
