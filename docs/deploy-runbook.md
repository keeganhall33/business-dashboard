# Business Dashboard — Deploy Runbook (Fly + Vercel)

This repo deploys the **API + Next server** to Fly and triggers a **Vercel UI** publish via deploy hook.

Source: `business-dashboard/scripts/deploy.sh`.

## Preconditions

- `flyctl` authenticated and pointing at the correct Fly app.
- Vercel deploy hook created (optional): set `VERCEL_DEPLOY_HOOK_URL`.
- Supabase env vars set for production runtime.

Recommended env names (adjust to match your app):

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

## Deploy (normal)

From `business-dashboard/`:

```bash
./scripts/deploy.sh
```

Pass any `fly deploy` flags you need:

```bash
./scripts/deploy.sh --strategy rolling
```

What it does:

1. `fly deploy --remote-only`
2. If `VERCEL_DEPLOY_HOOK_URL` is set, `POST` to it so Vercel publishes the same commit.

## Post-deploy smoke check

Run a cheap smoke check against the public URL:

```bash
SMOKE_BASE_URL="https://<your-domain>" ./scripts/smoke-check.sh
```

Optional Slack alert:

```bash
SMOKE_BASE_URL="https://<your-domain>" \
SLACK_WEBHOOK_URL="https://hooks.slack.com/..." \
./scripts/smoke-check.sh
```

The smoke check validates:

- `GET /dashboard` returns 200
- `GET /api/dashboard/overview` returns JSON containing `ok:true`

## Supabase service role key rotation (safe)

Do **not** rotate keys by editing code. Rotate by **staging the new key**, deploying, validating, then revoking the old key.

1. **Create a new service role key** in Supabase (Project Settings → API).
2. **Add the new key** as a secret in both deploy targets:
   - Fly: set `SUPABASE_SERVICE_ROLE_KEY` (and any other Supabase secrets)
   - Vercel: set `SUPABASE_SERVICE_ROLE_KEY`
3. **Deploy** using `./scripts/deploy.sh`.
4. **Smoke check**:

   ```bash
   SMOKE_BASE_URL="https://<your-domain>" ./scripts/smoke-check.sh
   ```

   Also manually load `/dashboard` and confirm the pipeline panel renders.

5. **Revoke the old key** in Supabase only after the new deploy is verified.

Rollback: re-set the previous `SUPABASE_SERVICE_ROLE_KEY` in Fly/Vercel and redeploy.

## Notes for E2E tests

The Playwright suite uses an `E2E_TEST=1` harness to avoid needing Supabase/network in CI.

Key harness paths:

- `GET /api/dashboard/overview` (fixture includes header KPIs + pipeline collectors/deals)
- `POST /api/collectors` (fixture write path)
- `GET/POST /api/kpis` (fixture store)

