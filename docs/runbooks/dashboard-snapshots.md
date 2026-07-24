# Dashboard Snapshot Refresh Runbook

Phase A ships only when the manual snapshot data below is fresh. Run these commands **before every deploy** (or any time freshness warnings appear) and record the timestamp from each output file.

## 1. Website / Woo / GA4 snapshot

```
pnpm website:run
```

- Output: `dashboard/data/website/latest.json`
- Freshness rule: `generatedAt` must be ≤ 24 hours old.
- Verification: `jq '.generatedAt' dashboard/data/website/latest.json`.

## 2. Meta Ads snapshot (optional for Phase A; required once paid panels return)

```
pnpm meta:run
```

- Output: `dashboard/data/meta/latest.json`
- Freshness rule: ≤ 72 hours. Hide paid panels if older.
- Verification: `jq '.generatedAt' dashboard/data/meta/latest.json`.

## 3. Marketing Command snapshot (required before enabling Command Feed / Promote & Protect)

```
pnpm marketing:run
```

- Output: `dashboard/data/marketing/latest.json` (or equivalent agent directory)
- Freshness rule: same day as deploy.
- Verification: confirm `generatedAt` in the JSON matches today.

## 4. Cloudflare snapshot (only if the Cloudflare panel ships)

```
pnpm cloudflare:run
```

- Output: `dashboard/data/cloudflare/latest.json`
- Freshness rule: ≤ 48 hours.
- Verification: `jq '.generatedAt' dashboard/data/cloudflare/latest.json`.

## Recording freshness

After each command:

1. Check `generatedAt` timestamp.
2. Note it in the deploy log / changelog.
3. If any snapshot is older than the rule above, hide the dependent panel before shipping.

_No scheduler automation yet—these commands are manual until later phases._
