import test from "node:test";
import assert from "node:assert/strict";

import { qualifyHoophallItemToMilestone, buildHoophallMilestone } from "@/lib/external-intelligence/collection/hoophall/hoophall.qualification";
import { SportsMilestoneSchema } from "@/lib/external-intelligence/milestones/contracts";

test("b6 hoophall: qualifying enshrinement text yields category + date", () => {
  const q = qualifyHoophallItemToMilestone({
    headline: "Naismith Basketball Hall of Fame Announces 2026 Enshrinement Ceremony Presenters",
    listing_description: "The Naismith Basketball Hall of Fame announced the ceremony will take place July 15, 2026.",
    detail_excerpt: null
  });
  assert.equal(q.ok, true);
  if (!q.ok) return;
  assert.equal(q.category, "hall_of_fame_enshrinement");
  assert.equal(q.milestone_date_ymd, "2026-07-15");

  const m = buildHoophallMilestone({
    category: q.category,
    milestone_date_ymd: q.milestone_date_ymd,
    evidence_url: "https://www.hoophall.com/news/example",
    evidence_label: "Example"
  });
  const parsed = SportsMilestoneSchema.parse(m);
  assert.equal(parsed.milestone_date, "2026-07-15");
});

test("b6 hoophall: ambiguous or missing date fails closed", () => {
  const q = qualifyHoophallItemToMilestone({
    headline: "Hall of Fame Announces Something",
    listing_description: "No explicit date in this blurb.",
    detail_excerpt: null
  });
  assert.equal(q.ok, false);
});

