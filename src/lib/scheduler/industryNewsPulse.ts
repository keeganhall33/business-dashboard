import { withJobRun } from "@/lib/scheduler/jobLogger";
import { NEWS_SOURCES } from "@/lib/news/sources";
import { canFetchUrl } from "@/lib/news/robots";
import { fetchRssFeed } from "@/lib/news/rss";
import { scoreFeedItem } from "@/lib/news/scoring";
import { enrichItem } from "@/lib/news/enrichment";
import {
  getIndustryNewsCandidates,
  setIndustryNewsFeatured,
  upsertIndustryNewsArticles
} from "@/lib/supabase/queries";

function yyyymmddInTz(date: Date, tz: string) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  return fmt.format(date);
}

function hoursAgoIso(hours: number) {
  const d = new Date(Date.now() - hours * 60 * 60 * 1000);
  return d.toISOString();
}

export async function runIndustryNewsPulse() {
  return withJobRun({
    jobKey: "industry-news-pulse",
    fn: async () => {
      const userAgent = "business-dashboard-bot";

      const ingestResults: Array<{ sourceKey: string; fetched: boolean; items: number; error?: string }> = [];
      let totalParsed = 0;

      for (const source of NEWS_SOURCES) {
        try {
          const allowed = await canFetchUrl(source.feedUrl, userAgent);
          if (!allowed) {
            ingestResults.push({ sourceKey: source.sourceKey, fetched: false, items: 0, error: "robots.txt disallow" });
            continue;
          }

          const items = await fetchRssFeed(source.feedUrl, { userAgent, timeoutMs: 15000 });
          const scored = items.map(scoreFeedItem);
          totalParsed += scored.length;

          await upsertIndustryNewsArticles(
            scored.map((item) => ({
              sourceKey: source.sourceKey,
              sourceName: source.sourceName,
              title: item.title,
              url: item.url,
              guid: item.guid ?? null,
              publishedAt: item.publishedAt ?? null,
              fetchedAt: new Date().toISOString(),
              summary: item.summary ?? null,
              score: item.score,
              scoreSignals: item.scoreSignals,
              rawJson: item
            }))
          );

          ingestResults.push({ sourceKey: source.sourceKey, fetched: true, items: scored.length });
        } catch (error) {
          ingestResults.push({
            sourceKey: source.sourceKey,
            fetched: false,
            items: 0,
            error: error instanceof Error ? error.message : String(error)
          });
        }
      }

      // Feature top 5 each local day (America/Los_Angeles by default via scheduler job row).
      // We use a 36h lookback to ensure the morning run can still feature late-night posts.
      const tz = "America/Los_Angeles";
      const featuredDate = yyyymmddInTz(new Date(), tz);

      const candidates = await getIndustryNewsCandidates({ publishedAfterIso: hoursAgoIso(36), limit: 50 });

      const top = candidates
        .filter((c) => c && c.url && c.title)
        .slice(0, 5);

      const featured: Array<{ url: string; rank: number }> = [];

      for (let i = 0; i < top.length; i += 1) {
        const row = top[i];
        const scoredItem = {
          title: row.title as string,
          url: row.url as string,
          guid: (row.guid as string | null) ?? null,
          publishedAt: (row.published_at as string | null) ?? null,
          summary: (row.summary as string | null) ?? null,
          sourceFeedUrl: "db"
        };

        const rescored = scoreFeedItem(scoredItem);
        const enrichment = enrichItem(rescored);

        await setIndustryNewsFeatured({
          url: row.url as string,
          featuredDate,
          featuredRank: i + 1,
          whyNow: enrichment.whyNow,
          collabConcept: enrichment.collabConcept,
          contactName: enrichment.contactName,
          contactEmail: enrichment.contactEmail,
          contactEmailSource: enrichment.contactEmailSource
        });

        featured.push({ url: row.url as string, rank: i + 1 });
      }

      return {
        sources: ingestResults,
        totalParsed,
        featuredDate,
        featured
      };
    },
    summarize: (result) => ({
      summary: `Parsed ${result.totalParsed} feed items; featured ${result.featured.length} for ${result.featuredDate}.`,
      detailsJson: result
    })
  });
}
