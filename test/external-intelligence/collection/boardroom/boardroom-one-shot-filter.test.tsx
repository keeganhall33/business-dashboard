import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  filterBoardroomItemsForOneShot,
  normalizeBoardroomOneShotFilter
} from "@/lib/external-intelligence/orchestration/handlers/boardroom-one-shot-filter";

test("boardroom one-shot filter: allowlist by evidence_reference_id blocks non-matching items", () => {
  const items = [
    { canonical_url: "https://boardroom.tv/a", guid: "g1" },
    { canonical_url: "https://boardroom.tv/b", guid: "g2" },
    { canonical_url: "https://boardroom.tv/c", guid: "g3" }
  ];

  const filter = normalizeBoardroomOneShotFilter({ evidence_reference_ids: ["ev_br1"], canonical_urls: [] });
  assert.ok(filter);

  const out = filterBoardroomItemsForOneShot({
    items,
    filter,
    computeEvidenceReferenceId: ({ canonical_url }) => (canonical_url === "https://boardroom.tv/b" ? "ev_br1" : "ev_other")
  });

  assert.equal(out.mode, "filtered");
  assert.equal(out.filtered.length, 1);
  assert.equal(out.filtered[0]!.canonical_url, "https://boardroom.tv/b");
  assert.equal(out.skipped_count, 2);
});

test("boardroom one-shot filter: allowlist by canonical_url blocks non-matching items", () => {
  const items = [
    { canonical_url: "https://boardroom.tv/a", guid: "g1" },
    { canonical_url: "https://boardroom.tv/b", guid: "g2" }
  ];

  const filter = normalizeBoardroomOneShotFilter({ canonical_urls: ["https://boardroom.tv/a"] });
  assert.ok(filter);

  const out = filterBoardroomItemsForOneShot({
    items,
    filter,
    computeEvidenceReferenceId: () => "ev_unused"
  });

  assert.equal(out.filtered.length, 1);
  assert.equal(out.filtered[0]!.canonical_url, "https://boardroom.tv/a");
  assert.equal(out.skipped_count, 1);
});

test("boardroom lane: one-shot filter is one-shot-only and schedule mutation remains scheduler-only (static guard)", () => {
  const file = path.join(
    process.cwd(),
    "src/lib/external-intelligence/orchestration/handlers/boardroom-collection-v1.ts"
  );
  const src = fs.readFileSync(file, "utf8");

  // Must not mutate schedules in one_shot mode.
  assert.match(src, /if \(mode === "scheduler"\) \{\s*[\s\S]*?external_collection_schedules_v1[\s\S]*?\.update\(/);

  // Filter must be gated to one_shot mode.
  assert.match(src, /const oneShotFilter = mode === "one_shot"/);
});
