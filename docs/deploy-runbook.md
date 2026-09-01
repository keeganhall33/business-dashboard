# Business Dashboard Deploy Runbook

Production deploys through Vercel Git integration. Fly is no longer part of the production deployment path.

## Preconditions

- Vercel project is connected to this GitHub repository.
- Production environment variables are configured in Vercel.
- Supabase credentials are available to the production runtime.

Recommended env names:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `DASHBOARD_ADMIN_TOKEN`

## Deploy

Merge a validated pull request to `main`. Vercel Git integration is the only production deployment path.

Do not trigger a second manual production deploy for the same commit unless recovery is explicitly required.

## Post-deploy smoke check

The validated-main workflow runs the production smoke check after merge. You can also run it manually:

```bash
SMOKE_BASE_URL="https://<your-domain>" ./scripts/smoke-check.sh
```

The smoke check validates:

- `GET /dashboard` returns 200.
- `GET /api/dashboard/overview` returns either the expected authenticated-production response or a valid development payload.
- The overview payload contains the required shape when the endpoint is readable.

Transient transport failures are retried with bounded backoff. Defaults can be overridden for diagnostics:

```bash
SMOKE_CURL_RETRIES=4 \
SMOKE_CURL_RETRY_DELAY_SECONDS=2 \
SMOKE_CURL_CONNECT_TIMEOUT_SECONDS=10 \
SMOKE_CURL_MAX_TIME_SECONDS=30 \
SMOKE_BASE_URL="https://<your-domain>" \
./scripts/smoke-check.sh
```

Retries apply to transport failures only. Unexpected HTTP status codes or malformed response content still fail the smoke check.

Optional Slack alert:

```bash
SMOKE_BASE_URL="https://<your-domain>" \
SLACK_WEBHOOK_URL="https://hooks.slack.com/..." \
./scripts/smoke-check.sh
```

## Dashboard SSR authentication

The Next.js server calls protected dashboard APIs with `x-dashboard-secret`.

- Set `DASHBOARD_ADMIN_TOKEN` in Vercel and `.env.local` for local SSR smoke tests.
- `src/lib/api/dashboard.ts` injects the header on the server.
- Never expose the token client-side.
- A successful production check requires `/dashboard` to render and the protected overview path to behave as expected.

## Supabase service role key rotation

Do not rotate keys by editing code. Rotate by staging the new key, deploying, validating, then revoking the old key.

1. Create a new service role key in Supabase.
2. Add the new `SUPABASE_SERVICE_ROLE_KEY` to Vercel production environment variables.
3. Merge or redeploy the intended validated commit.
4. Run the production smoke check and manually verify the dashboard if the change is high risk.
5. Revoke the old key only after the new deployment is verified.

Rollback by restoring the previous Vercel secret and redeploying the last known-good commit.

## Notes for E2E tests

The Playwright suite uses an `E2E_TEST=1` harness to avoid requiring live Supabase or network access in CI.

Key harness paths:

- `GET /api/dashboard/overview`
- `POST /api/collectors`
- `GET/POST /api/kpis`

## 1Password CLI and production env operations

Production Supabase credentials may be resolved locally via 1Password secret refs:

```bash
op run --env-file .env.woo.ci -- <command>
```

Rules:

- Never print resolved secret values.
- If authenticated `op` commands hang, confirm a stale 1Password CLI process before using `pkill -x op`.
- Do not assume a stored service-account token is valid unless it is verified non-empty.
- Do not rotate or create credentials as the first troubleshooting step.
