# Partnership Feed Setup (Noah)

## Input modes
1. **Internal Opportunity Feed (live)** – curated high-confidence partnership pitches already scoped in pipeline docs or decks.
2. **External Opportunity Radar (future)** – monitored announcements (sports milestones, releases, sponsorship news, etc.). This sprint focuses on design only; ingestion stays manual.

## Snapshot format
File: `dashboard/data/opportunities/latest.json`
```json
{
  "generatedAt": "YYYY-MM-DDTHH:mm:ss.sssZ",
  "source": "manual",
  "items": [
    {
      "id": "unique.slug",
      "headline": "Opportunity headline",
      "category": "sports",
      "subject": "Team / person / brand",
      "organization": "Org name",
      "sourceName": "News outlet / note",
      "sourceUrl": "https://example.com/article",
      "observedAt": "2026-06-21T00:00:00.000Z",
      "whyNow": "Why the timing matters",
      "whyItMatters": "Business relevance",
      "keeganAngle": "Specific art / collaboration angle",
      "recommendedArtworkOrConcept": "Artwork / product to feature",
      "suggestedContactType": "Agent / partner / PR",
      "suggestedPitchAngle": "Pitch framing",
      "urgency": "high",
      "confidence": "medium",
      "nextManualAction": "Research contact + prep intro deck",
      "shouldBecomePreparedAction": false,
      "notes": "Optional",
      "status": "live"
    }
  ]
}
```
- Set `status: "sample"` for placeholder entries (Noah ignores them).
- Leave `items` empty when there are no live opportunities.

## Supabase upload
```bash
op run --env-file=.env --env-file=.env.meta -- pnpm partnership:run
```
- Reads the JSON file and upserts it to `dashboard_snapshots` with `key = partnership_feed`.
- `mode = LIVE` when `items.length > 0`, otherwise `PARTIAL`.

## Dashboard behavior
- `/api/dashboard/overview` exposes `partnershipFeed` from Supabase (fallbacks to local JSON when needed).
- Noah Agent Console surfaces the highest-confidence/urgency entry (ignoring samples) with hook + next action.
- If `items` is empty, Noah remains blocked and instructs where to add data.

## Guardrails
- Manual feed only (no web scraping, no outreach, no scheduler).
- Entries describe opportunities + suggested next manual steps; execution always remains manual/approval-first.

## Future External Opportunity Radar Sources
*(Design only — not yet ingested)*

- Sports business news (athlete sponsorship announcements, NIL deals)
- Entertainment release calendars (movie premieres, streaming/documentary drops)
- Music release calendars & brand partnerships
- Museum / Hall of Fame / team milestone calendars
- Charity gala / foundations / community events
- Product launches & brand campaigns (tech, art supplies, sports brands)
- Collector-market & memorabilia news (auctions, card chases)

Each radar entry will use the same schema (with `sourceType`, `sourceName`, `sourceUrl`, `announcementType`, `relevanceWindow`, etc.). Noah will score items deterministically based on:

1. **Timeliness** – is the announcement recent and does it have a clear relevance window?
2. **Relevance** – does it align with known art subjects (NBA, MLB, golf, charity)?
3. **Relationship proximity** – do existing partnerships/contacts make outreach credible?
4. **Brand/Cultural momentum** – is the moment high-profile or viral?
5. **Charity/fundraising potential** – does it support an existing philanthropic angle?
6. **Revenue/impact potential** – can the opportunity drive signed prints, originals, or prestige placements?
7. **Urgency + Confidence** – human-weighted scores (high/medium/low) that determine display order.

No external crawler, scheduler, or outreach will be implemented until the data sources and manual vetting process are approved.
