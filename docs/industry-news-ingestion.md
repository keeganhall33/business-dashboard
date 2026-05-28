# Industry news ingestion + enrichment

This repo includes a **twice-daily** ingestion job that pulls recent stories from a curated list of industry outlets (sports, music, entertainment, art, and business) and enriches the top opportunities for partnership/collab relevance.

## What it does

On each run (`industry-news-pulse`):

1. Fetch each configured RSS feed (low-volume, once per source per run).
2. Respect `robots.txt` (best-effort) for RSS endpoints.
3. Dedupe by URL (upsert into `industry_news_articles`).
4. Score each item for partnership relevance.
5. For the current local day (America/Los_Angeles), pick **top 5** candidates from the last ~36 hours.
6. Enrich each featured item with:
   - **Why now** (short justification)
   - **Creative collab concept** (varies by vertical)
   - **Contact email**
     - extracted if present in the feed summary
     - otherwise inferred from publisher/domain patterns

## Data model (Supabase)

Tables:

- `industry_news_articles`
  - archive of all ingested articles
  - enrichment fields
  - `featured_date` + `featured_rank` for surfacing the top 5 per day

Migrations:

- `supabase/migrations/20260526_add_industry_news_ingestion.sql`
- `supabase/migrations/20260526_add_industry_news_pulse_job.sql`

## Scheduler wiring

This job is registered in `scheduled_jobs` as:

- `job_key`: `industry-news-pulse`
- `route_path`: `/api/scheduler/industry-news-pulse`
- cron: `0 7,16 * * *` (7am + 4pm, America/Los_Angeles)

If you use the **single-entry cron** approach, you do not need a new cron line; `POST /api/scheduler/tick` will pick it up.

## Environment variables

Required for live writes:

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Optional feed overrides:

- `PUCK_RSS_URL` (default `https://puck.news/feed/`)
- `SBJ_RSS_URL` (default `https://feeds.feedburner.com/SportsBusinessJournal`)
- `AXIOS_RSS_URL` (default `https://feeds.feedburner.com/axios`)

Scheduler auth (already used by other jobs):

- `SCHEDULER_SECRET`

## Local validation

- Unit tests:
  ```bash
  npm test
  ```

- Manual run (dev server must be running):
  ```bash
  curl -X POST \
    -H "x-scheduler-secret: $SCHEDULER_SECRET" \
    http://localhost:3000/api/scheduler/industry-news-pulse
  ```

Or let `tick` execute it:

```bash
curl -X POST -H "x-scheduler-secret: $SCHEDULER_SECRET" http://localhost:3000/api/scheduler/tick
```
