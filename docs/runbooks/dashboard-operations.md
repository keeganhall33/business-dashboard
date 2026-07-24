# Dashboard Operations Playbook

_Last updated: 2026-06-17_

## 1. Current Status (GREEN unless noted)

| Surface | Status | Notes |
| --- | --- | --- |
| Website / Woo / GA4 | **GREEN** – manual 7‑day pull via `pnpm website:run` | GA4 service account + Woo creds injected via `.env.website`. |
| Meta snapshot | **GREEN** – manual 7‑day pull via `pnpm meta:run` | Uses the same op-injected env. |
| Funnel | **YELLOW** – data derived from FunnelKit events captured inside the website agent + marketing command | No standalone script; freshness comes from the latest website + Woo snapshots (48h staleness guard). |
| Marketing Command | **GREEN** – manual run (`pnpm marketing:run:op`) refreshes comparison + insights | Cron is **OFF**. |
| Product Momentum | **GREEN** when Woo creds are present (op run) | Falls back to cached topProducts if Woo creds missing. |
| Sales Geography | **GREEN** – privacy guardrails enforced (city/state require ≥3 orders) | Comparison vs previous 7d now live. |
| Freshness strip | **GREEN** | Shows Website, Meta, Funnel, Marketing Command, Sales Geography. |
| Automation / Cron / Agents / Outreach | **OFF / RED** by design | Scheduler disabled; no agents, no outbound campaigns, no collectors processing. |

## 2. Manual Daily Refresh Procedure

> **Prereqs**: Unlock 1Password desktop, ensure `.env` + `.env.website` contain Supabase + GA4/Woo refs (op URIs). Run all commands from `~/.../business-dashboard`.

1. **Website + Woo + GA4 snapshot**
   ```bash
   op run --env-file=.env --env-file=.env.website -- sh -lc 'pnpm website:run'
   ```
2. **Meta reporting snapshot**
   ```bash
   op run --env-file=.env --env-file=.env.website -- sh -lc 'pnpm meta:run'
   ```
3. **(Optional) Other telemetry** – run only if those surfaces are needed that day (all inherit the same env injection):
   ```bash
   # Cloudflare, Social, Leads, etc.
   op run --env-file=.env --env-file=.env.website -- sh -lc 'pnpm cloudflare:run'
   ```
4. **Marketing Command (Products + Geography + Insights)**
   - Preferred shortcut:
     ```bash
     pnpm marketing:run:op
     ```
   - Equivalent raw command (use if the shortcut ever fails):
     ```bash
     op run --env-file=.env --env-file=.env.website -- sh -lc 'pnpm marketing:run'
     ```

## 3. Morning Verification Checklist

After the runs complete:

1. `curl https://keegan-dashboard.fly.dev/api/health` → `{ "ok": true, ... }`.
2. `curl -H "Authorization: Bearer <DASHBOARD_ADMIN_TOKEN> https://keegan-dashboard.fly.dev/api/dashboard/overview?range=7d` and confirm the payload includes:
   - `websiteConversion`
   - `metaAds`
   - `marketingCommand` (with `productMomentum`, `salesGeography`, and `salesGeography.comparison`).
3. Load `https://keegan-dashboard.fly.dev/dashboard` and confirm:
   - Freshness strip is green for Website, Meta, Funnel, Marketing Command, Sales Geography.
   - Marketing Command summary + actions render (no stale warnings).
   - Funnel panel shows recent entries/completions.
   - Product Momentum card present (or gracefully suppressed if Woo data is flat).
   - Sales Geography panel shows the visual + “Change vs last week” section without exposing sub-threshold city/state data.
4. Spot-check Supabase (`dashboard_snapshots`) if anything looks wrong (optional).

## 4. Known Limitations

- Cron / scheduler remains disabled (manual runs only).
- No automated daily approval step or history log yet.
- Single global range (`7d`) – no date picker.
- No globe/arcs visualization yet.
- No Meta creative/product mapping across geography.
- GA4 transaction IDs still missing (GA vs Woo mismatch highlighted in insights).
- Geography view intentionally aggregates to country/state until privacy thresholds are met.

## 5. Guardrails (do not change without explicit approval)

- **No customer PII** (names, emails, phones, street addresses, postcodes).
- **No source system setting changes** (GA4, Woo, Meta) from this repo.
- **No Meta campaign/budget edits**.
- **No outbound emails or automations**.
- **No cron / agent activation**.
- **No Collectors or inactive partnership processing**.

## 6. Recommended Next Milestone

- **Daily manual proof run tomorrow** (repeat the commands & checklist) to build a stable baseline before planning cron/scheduler automation. Document any drift or manual friction encountered.

## 7. Tomorrow’s TODO (quick reminder)

- [ ] Run steps 1–4 above (in order) once 1Password is unlocked.
- [ ] Capture `/api/dashboard/overview?range=7d` snippet for the day’s comparison log.
- [ ] Notify if any freshness indicator goes yellow/red so we can prioritize the fix before adding new features.

## Dashboard Refresh Runbook (2026-06-25)

### Manual refresh command
```bash
cd ~/.openclaw/workspace/business-dashboard
./scripts/run-dashboard-refresh.sh
```

### Sources & env requirements
- Website & product conversion: `.env` + `.env.website`
- Marketing Command: `.env` + `.env.website`
- Meta Ads + Instagram: `.env` + `.env.meta`
- Supabase snapshots: `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`

### Snapshot outputs
- Website: `dashboard/data/website/latest.json` + Supabase `dashboard_snapshots.key=website`
- Product conversion: `dashboard/data/products/latest.json` + `dashboard_snapshots.key=product_conversion`
- Marketing Command: Supabase `dashboard_snapshots.key=marketing_command`
- Meta Ads: `dashboard/data/meta/latest.json` + `dashboard_snapshots.key=meta`
- Social: `dashboard/data/social/latest.json` + `dashboard_snapshots.key=social_content`

### Expected warnings
- `scheduler alerts ECONNREFUSED 127.0.0.1:3000` during local runs is non-blocking (local scheduler API not running).

### Troubleshooting
1. Ensure `op` session is unlocked; scripts rely on 1Password `op run` for secrets.
2. If GA4/Woo steps fail, rerun website + products first; others can follow once data is fresh.
3. Check `dashboard/logs/dashboard-refresh.log` for per-step status.
4. Verify Supabase rows with `select * from dashboard_snapshots where generated_at >= now() - interval '1 hour';`

### launchd automation
- Plist: `~/Library/LaunchAgents/com.keegan.dashboard-refresh.plist`
- Runs daily at **6:00 a.m. PT** (and once at load)
- Uses `/opt/homebrew/opt/node@22/bin` PATH so `pnpm`, `tsx`, and `op` are available
- Load/enable: `launchctl load ~/Library/LaunchAgents/com.keegan.dashboard-refresh.plist`
- Trigger immediately: `launchctl start com.keegan.dashboard-refresh`
- Disable/unload: `launchctl unload ~/Library/LaunchAgents/com.keegan.dashboard-refresh.plist`
- Verify scheduled: `launchctl list | grep dashboard-refresh`
- launchd stdout/stderr: `dashboard/logs/dashboard-refresh.launchd.{log,err.log}`

### Manual recovery (if scheduler fails)
```bash
cd ~/.openclaw/workspace/business-dashboard
./scripts/run-dashboard-refresh.sh
```
- Keep 1Password unlocked so `op run` can read secrets.
- Inspect `dashboard/logs/dashboard-refresh.log` after the run for per-source status.

### Travel / sleep settings
- Keep the Mac plugged in and set **System Settings → Displays → Advanced → Prevent automatic sleeping when the display is off**.
- Optionally use **System Settings → Battery → Options → Power Nap** to ensure launchd can run while display sleeps.
- If the Mac must sleep, run the manual refresh once you wake it to restore freshness.

### Known risks
- If 1Password CLI is locked, launchd logs `op run` failures; unlock 1Password, rerun the manual command, and refresh resumes next cycle.
- Local scheduler alert (`ECONNREFUSED 127.0.0.1:3000`) is safe to ignore.
