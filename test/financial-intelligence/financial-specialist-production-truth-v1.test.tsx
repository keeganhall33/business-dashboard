import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import React from "react";
import { renderToString } from "react-dom/server";

import FinancialSpecialistPage from "@/app/(app)/specialists/financial/page";

test("Financial production route contains no fixture-backed business truth", () => {
  const source = fs.readFileSync(
    "src/app/(app)/specialists/financial/page.tsx",
    "utf8"
  );

  assert.match(source, /getSpecialistCapabilityStatusV1/);
  assert.doesNotMatch(source, /financial-intelligence\/fixtures/);
  assert.doesNotMatch(source, /getFinancialIntelligenceFixtureBundleV1/);
  assert.doesNotMatch(source, /getSpecialistCommandCenterCardsV1/);
  assert.doesNotMatch(source, /bundle\.recommendations/);
});

test("Financial route renders the canonical fail-closed coverage state", () => {
  const html = renderToString(<FinancialSpecialistPage />);

  assert.match(html, /Financial intelligence/);
  assert.match(html, /UNAVAILABLE/);
  assert.match(html, />UNKNOWN</);
  assert.match(html, /FRESHNESS: UNKNOWN/);
  assert.match(
    html,
    /No canonical production financial specialist snapshot is supplied to this surface\./
  );
  assert.match(
    html,
    /Supply a verified production financial snapshot before presenting a financial conclusion\./
  );
  assert.match(html, /No current specialist conclusion is presented without a verified production input\./);
});

test("Financial route preserves its evidence boundary and useful navigation", () => {
  const html = renderToString(<FinancialSpecialistPage />);

  assert.match(html, /Command-center summary unavailable/);
  assert.match(html, /UNKNOWN direct costs/);
  assert.match(html, /demo or test fixtures/);
  assert.match(html, /href="\/specialists"/);
  assert.match(html, /href="\/data-evidence"/);
  assert.match(html, /href="\/executive-home"/);
  assert.doesNotMatch(html, /DO_NOW|PREPARE|MONITOR/);
  assert.doesNotMatch(html, /\$[0-9]/);
});
