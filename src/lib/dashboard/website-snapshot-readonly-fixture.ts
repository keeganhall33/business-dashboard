export type WebsiteSnapshotReadonlyFixtureV1 = {
  capturedAt: string | null;
  pageCount: number | null;
  changedPageCount: number | null;
  brokenLinkCount: number | null;
  missingAltCount: number | null;
  state: "OK" | "UNKNOWN";
  readOnly: true;
  mutationDisabled: true;
};

export const WEBSITE_SNAPSHOT_READONLY_FIXTURE_V1: WebsiteSnapshotReadonlyFixtureV1 = {
  capturedAt: "2026-08-13T00:00:00.000Z",
  pageCount: 18,
  changedPageCount: 0,
  brokenLinkCount: 2,
  missingAltCount: 5,
  state: "UNKNOWN",
  readOnly: true,
  mutationDisabled: true
};
