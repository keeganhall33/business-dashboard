# Social Connector Setup (Instagram/Facebook)

## Required env vars (store as op:// references)
- `META_PAGE_ACCESS_TOKEN` – Long-lived Page access token with `pages_show_list`, `pages_read_engagement`, `pages_read_user_content`, `instagram_basic`, `instagram_manage_insights`.
- `META_PAGE_ID` – Numeric FB Page ID.
- `META_IG_BUSINESS_ID` – Numeric IG Business Account ID (`178...`).
- `META_ACCESS_TOKEN` – (fallback) existing ads/system-user token.
- `META_APP_ID`/`META_APP_SECRET` – only needed if you regenerate tokens via the app.
- Supabase: `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (already in `.env`) so `pnpm social:run` can upload to `dashboard_snapshots` (`key = social_content`).

## Permissions checklist
1. Meta Business Settings → Business Info → ensure you are admin on the FB Page and linked IG account.
2. Meta App (Meta for Developers) → Add products: Facebook Login + Instagram Graph → request scopes:
   - `pages_show_list`
   - `pages_read_engagement`
   - `pages_read_user_content`
   - `instagram_basic`
   - `instagram_manage_insights`
3. Generate long-lived Page token or system-user token via Business Manager.

## Verification steps
1. `curl "https://graph.facebook.com/v20.0/me/accounts?access_token=$META_PAGE_ACCESS_TOKEN"`
   - Should list the FB Page with fields `id`, `name`, `access_token`, `instagram_business_account`.
2. `curl "https://graph.facebook.com/v20.0/PAGE_ID?fields=instagram_business_account&access_token=$META_PAGE_ACCESS_TOKEN"`
   - Should return `{ "instagram_business_account": { "id": "178..." } }`.
3. `curl "https://graph.facebook.com/v20.0/IG_BUSINESS_ID/media?fields=id,caption&access_token=$META_PAGE_ACCESS_TOKEN"`
   - Should list recent IG media IDs.
4. `curl "https://graph.facebook.com/v20.0/MEDIA_ID/insights?metric=reach,likes,comments,shares,saved,total_interactions&access_token=$META_PAGE_ACCESS_TOKEN"`
   - Confirms the metrics set is accepted (Meta rejects unsupported names).

## Ingestion command
```bash
op run --env-file=.env --env-file=.env.meta -- pnpm social:run
```
- Writes snapshot to `dashboard/data/social/latest.json`.
- Errors if tokens/IDs missing.
- Also upserts Supabase `dashboard_snapshots` with `key = social_content` (mode = `LIVE` when posts exist).

## Lyra dashboard wiring
- When snapshot exists, Lyra reads it and outputs one specific recommendation.
- If missing, console shows “Blocked” with exact setup steps.
- Metrics currently requested per media type:
  - Carousels/images: `reach`, `likes`, `comments`, `shares`, `saved`, `total_interactions`.
  - Videos/Reels add `views`, `total_views`, `ig_reels_avg_watch_time`, `ig_reels_video_view_total_time` (missing metrics are skipped gracefully).
- Engagement rate = `total_interactions / reach` (or `/ views` fallback).
