import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { WebsiteSnapshotReadonlyCard } from "../../src/components/dashboard/WebsiteSnapshotReadonlyCard";
import { WEBSITE_SNAPSHOT_READONLY_FIXTURE_V1 } from "../../src/lib/dashboard/website-snapshot-readonly-fixture";

test("WebsiteSnapshotReadonlyCard always renders READ_ONLY + MUTATION_DISABLED and UNKNOWN as 'Unknown'", () => {
  const html = renderToStaticMarkup(<WebsiteSnapshotReadonlyCard snapshot={WEBSITE_SNAPSHOT_READONLY_FIXTURE_V1} />);
  assert.match(html, /READ_ONLY/);
  assert.match(html, /MUTATION_DISABLED/);
  assert.match(html, />Unknown</);
  // Avoid accidentally presenting OK when state is UNKNOWN.
  assert.doesNotMatch(html, />OK</);
});

