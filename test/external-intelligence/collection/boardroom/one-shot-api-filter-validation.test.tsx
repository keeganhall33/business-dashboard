import test from "node:test";
import assert from "node:assert/strict";

import { __test__parseOneShotBody } from "@/app/api/external-intelligence/one-shot-external-collection/route";

test("one-shot API: explicitly empty boardroom filter fails closed", () => {
  assert.throws(
    () =>
      __test__parseOneShotBody({
        schedule_id: "sports_business.boardroom:production",
        dry_run: true,
        requested_by: "test",
        boardroom: {}
      }),
    /empty_boardroom_filter/
  );
});

test("one-shot API: boardroom filter cannot be used for hoophall schedule", () => {
  assert.throws(
    () =>
      __test__parseOneShotBody({
        schedule_id: "sports.basketball.hoophall.official:production",
        dry_run: true,
        requested_by: "test",
        boardroom: { evidence_reference_ids: ["ev_x"] }
      }),
    /boardroom_filter_not_allowed_for_schedule/
  );
});

test("one-shot API: malformed selector types rejected", () => {
  assert.throws(
    () =>
      __test__parseOneShotBody({
        schedule_id: "sports_business.boardroom:production",
        dry_run: true,
        requested_by: "test",
        boardroom: { evidence_reference_ids: "nope" }
      }),
    /expected array/i
  );
});

test("one-shot API: explicitly empty arrays rejected", () => {
  assert.throws(
    () =>
      __test__parseOneShotBody({
        schedule_id: "sports_business.boardroom:production",
        dry_run: true,
        requested_by: "test",
        boardroom: { evidence_reference_ids: [] }
      }),
    /(Too small: expected array to have >=1 items|too_small)/
  );
  assert.throws(
    () =>
      __test__parseOneShotBody({
        schedule_id: "sports_business.boardroom:production",
        dry_run: true,
        requested_by: "test",
        boardroom: { canonical_urls: [] }
      }),
    /(Too small: expected array to have >=1 items|too_small)/
  );
});

test("one-shot API: boardroom filter cannot exceed 5 targets", () => {
  assert.throws(
    () =>
      __test__parseOneShotBody({
        schedule_id: "sports_business.boardroom:production",
        dry_run: true,
        requested_by: "test",
        boardroom: { evidence_reference_ids: ["1", "2", "3", "4", "5", "6"] }
      }),
    /(Too big: expected array to have <=5 items|too_big)/
  );
});
