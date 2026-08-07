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

test("b6 hoophall: qualifying categories (one each) remain deterministic", () => {
  const toMonth = (ymd: string) => {
    const [y, m, d] = ymd.split("-").map(Number);
    const month =
      [
        "January",
        "February",
        "March",
        "April",
        "May",
        "June",
        "July",
        "August",
        "September",
        "October",
        "November",
        "December"
      ][m - 1] ?? "";
    return `${month} ${String(d).padStart(2, "0")}, ${y}`;
  };

  const cases: Array<{ headline: string; want: string; date: string }> = [
    { headline: "Hall of Fame Finalists Announced", want: "hall_of_fame_finalist", date: "2027-02-10" },
    { headline: "Hall of Fame Induction Class of 2027 Announced", want: "hall_of_fame_induction", date: "2027-04-01" },
    { headline: "Enshrinement Ceremony Presenters Announced", want: "hall_of_fame_enshrinement", date: "2027-08-15" },
    { headline: "Ceremony Schedule Released", want: "hall_of_fame_ceremony", date: "2027-08-14" },
    { headline: "Stephen Curry Immersive Exhibit Opens", want: "jersey_or_honor_exhibition", date: "2027-01-05" },
    { headline: "Hall Announces 75th Anniversary Celebration Event", want: "major_hall_anniversary_event", date: "2027-06-01" }
  ];

  for (const c of cases) {
    const q2 = qualifyHoophallItemToMilestone({
      headline: c.headline,
      listing_description: `The Hall announced the event will take place ${toMonth(c.date)}.`,
      detail_excerpt: null
    });

    assert.equal(q2.ok, true);
    if (!q2.ok) continue;
    assert.equal(q2.category, c.want);
  }
});

test("b6 hoophall: ambiguous or missing date fails closed", () => {
  const q = qualifyHoophallItemToMilestone({
    headline: "Hall of Fame Announces Something",
    listing_description: "No explicit date in this blurb.",
    detail_excerpt: null
  });
  assert.equal(q.ok, false);
});
