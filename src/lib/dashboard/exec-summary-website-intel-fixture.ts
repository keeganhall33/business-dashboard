export type ExecSummaryWebsiteIntelFixtureV1 = {
  state: "OK" | "UNKNOWN";
  capturedAt: string | null;
  brokenLinkCount: number | null;
  missingAltCount: number | null;
  readOnly: true;
  mutationDisabled: true;
};

export const EXEC_SUMMARY_WEBSITE_INTEL_FIXTURE_V1: ExecSummaryWebsiteIntelFixtureV1 = {
  state: "UNKNOWN",
  capturedAt: "2026-08-13T00:00:00.000Z",
  brokenLinkCount: 2,
  missingAltCount: 5,
  readOnly: true,
  mutationDisabled: true
};

