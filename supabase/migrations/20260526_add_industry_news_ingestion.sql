-- Industry news ingestion + enrichment tables

create table if not exists industry_news_articles (
  id uuid primary key default gen_random_uuid(),
  source_key text not null,
  source_name text not null,
  title text not null,
  url text not null,
  guid text null,
  summary text null,
  published_at timestamptz null,
  fetched_at timestamptz not null default now(),
  score numeric not null default 0,
  score_signals text[] not null default '{}',

  -- Enrichment fields
  why_now text null,
  collab_concept text null,
  contact_email text null,
  contact_email_source text null,
  enriched_at timestamptz null,

  -- Surfacing controls (top 5 per day)
  featured_date date null,
  featured_rank int null,

  raw_json jsonb null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists industry_news_articles_url_key on industry_news_articles (url);
create index if not exists industry_news_articles_published_at_idx on industry_news_articles (published_at desc);
create index if not exists industry_news_articles_featured_date_rank_idx on industry_news_articles (featured_date, featured_rank);
create index if not exists industry_news_articles_score_idx on industry_news_articles (score desc);

-- updated_at trigger (if the helper exists; otherwise noop)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_proc
    WHERE proname = 'set_updated_at'
  ) THEN
    EXECUTE 'create trigger set_industry_news_articles_updated_at
      before update on industry_news_articles
      for each row
      execute procedure set_updated_at();';
  END IF;
EXCEPTION WHEN duplicate_object THEN
  -- ignore
END $$;
