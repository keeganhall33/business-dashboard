import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const PURPOSE_BUILT_PRODUCTION_ROUTES = [
  "src/app/(app)/opportunities-actions/page.tsx",
  "src/app/(app)/events-market-windows/page.tsx",
  "src/app/(app)/specialists/page.tsx",
  "src/app/(app)/relationships/page.tsx",
  "src/app/(app)/relationships/companies/[id]/page.tsx",
  "src/app/(app)/learning/page.tsx",
  "src/app/(app)/specialists/sports-art-partners/page.tsx",
] as const;

test("rebuilt production routes do not regress to the generic ExecutiveWorkspacePage template", () => {
  for (const path of PURPOSE_BUILT_PRODUCTION_ROUTES) {
    assert.doesNotMatch(source(path), /ExecutiveWorkspacePage/, `${path} must remain purpose-built`);
  }
});

test("Opportunities stays wired to canonical dashboard evidence rather than a production fixture", () => {
  const route = source("src/app/(app)/opportunities-actions/page.tsx");

  assert.match(route, /getDashboardOverview/);
  assert.match(route, /buildExecutiveOpportunityPortfolioV1/);
  assert.match(route, /No planning fixtures are substituted/);
  assert.doesNotMatch(route, /FIXTURE_V1|fixtures\//);
});

test("Events stays repository-backed and fails closed when its source is unavailable", () => {
  const route = source("src/app/(app)/events-market-windows/page.tsx");

  assert.match(route, /SportsMilestoneRepository/);
  assert.match(route, /sourceStatus:\s*"AVAILABLE"\s*\|\s*"UNAVAILABLE"/);
  assert.match(route, /sourceStatus\s*=\s*"UNAVAILABLE"/);
  assert.doesNotMatch(route, /FIXTURE_V1|fixtures\//);
});

test("Specialists index stays on the production capability boundary", () => {
  const route = source("src/app/(app)/specialists/page.tsx");

  assert.match(route, /getSpecialistCapabilityStatusV1/);
  assert.match(route, /Fixture substitution/);
  assert.match(route, /Disabled for production/);
  assert.doesNotMatch(route, /getSpecialistCommandCenterCardsV1|FIXTURE_V1|fixtures\//);
});

test("Learning and Sports Art Partner production routes fail closed instead of promoting fixtures", () => {
  const learning = source("src/app/(app)/learning/page.tsx");
  const sportsPartners = source("src/app/(app)/specialists/sports-art-partners/page.tsx");

  assert.match(learning, /buildExecutiveLearningWorkspaceV1\(\{\s*records:\s*null\s*\}\)/);
  assert.doesNotMatch(learning, /FIXTURE_V1|fixtures\//);
  assert.match(sportsPartners, /dashboard=\{null\}/);
  assert.doesNotMatch(sportsPartners, /SPORTS_ART_PARTNER_UNIVERSE_FIXTURE_V1|fixtures\//);
});

test("company detail uses canonical production records and still refuses to fabricate unsupported data", () => {
  const route = source("src/app/(app)/relationships/companies/[id]/page.tsx");

  assert.match(route, /loadCrmDirectoryIndexV1/);
  assert.match(route, /const index = await loadCrmDirectoryIndexV1\(\)/);
  assert.match(route, /resolveCrmCompanyDetailV1\(index,\s*id\)/);
  assert.match(route, /if \(!company\) notFound\(\)/);
  assert.match(route, /<CrmCompanyDetailV1 company=\{company\}/);
  assert.doesNotMatch(route, /EMPTY_CRM_DIRECTORY_INDEX_V1|FIXTURE_V1|fixtures\//);
});
