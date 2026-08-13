export type WebsiteOpportunityFixtureV1 = {
  id: string;
  title: string;
  detail: string;
  severity: "high" | "medium" | "low" | "unknown";
};

export type WebsiteIntelligenceSummaryFixtureV1 = {
  capturedAt: string | null;
  pageCount: number | null;
  brokenLinkCount: number | null;
  missingAltCount: number | null;
  state: "OK" | "UNKNOWN";
  readOnly: true;
  mutationDisabled: true;
  topOpportunities: WebsiteOpportunityFixtureV1[];
};

export const WEBSITE_INTELLIGENCE_SUMMARY_FIXTURE_V1: WebsiteIntelligenceSummaryFixtureV1 = {
  capturedAt: "2026-08-13T00:00:00.000Z",
  pageCount: 18,
  brokenLinkCount: 2,
  missingAltCount: 5,
  state: "UNKNOWN",
  readOnly: true,
  mutationDisabled: true,
  topOpportunities: [
    {
      id: "opp-1",
      title: "Fix missing alt text",
      detail: "5 images are missing alt text; improve accessibility and SEO signals.",
      severity: "medium"
    },
    {
      id: "opp-2",
      title: "Repair broken internal links",
      detail: "2 internal links returned 4xx; remove or redirect.",
      severity: "high"
    },
    {
      id: "opp-3",
      title: "Reduce duplicate titles/meta",
      detail: "Multiple pages share the same title/meta; refine per-page intent.",
      severity: "low"
    }
  ]
};

