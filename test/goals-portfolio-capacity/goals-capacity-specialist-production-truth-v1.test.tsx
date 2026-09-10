import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import GoalsCapacitySpecialistPage from "@/app/(app)/specialists/goals-capacity/page";

const routePath = "src/app/(app)/specialists/goals-capacity/page.tsx";

function readRouteSource() {
  return readFileSync(resolve(process.cwd(), routePath), "utf8");
}

test("production goals-capacity route does not import or execute fixture-backed specialist intelligence", () => {
  const source = readRouteSource();

  for (const forbidden of [
    "getGoalsPortfolioCapacityFixtureBundleV1",
    "toExecutiveGoalsCapacityViewModelsV1",
    "getSpecialistCommandCenterCardsV1",
    "goals-portfolio-capacity/fixtures",
  ]) {
    assert.doesNotMatch(source, new RegExp(forbidden));
  }

  assert.match(source, /getSpecialistCapabilityStatusV1/);
  assert.match(source, /item\.id\s*===\s*["']goals-capacity["']/);
});

test("production goals-capacity route renders the canonical fail-closed capability state", () => {
  const html = renderToStaticMarkup(<GoalsCapacitySpecialistPage />);

  assert.match(html, />UNAVAILABLE</);
  assert.match(html, />UNKNOWN</);
  assert.match(html, /FRESHNESS:\s*UNKNOWN/);
  assert.match(html, /No canonical production goals or capacity specialist snapshot is supplied to this surface\./);
  assert.match(html, /Supply verified goals and capacity evidence before presenting portfolio pressure as current truth\./);
  assert.match(html, /Test fixtures are not used as live business truth\./);
  assert.doesNotMatch(html, /Command-center summary/);
});
