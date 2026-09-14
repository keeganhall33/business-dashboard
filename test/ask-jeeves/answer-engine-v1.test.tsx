import assert from "node:assert/strict";
import test from "node:test";

import { answerAskJeevesV1 } from "@/lib/ask-jeeves/answer-engine-v1";
import { EXECUTIVE_HOME_FIXTURE_V1 } from "@/lib/executive-home/fixtures";
import { buildExecutiveOpportunityPortfolioV1 } from "@/lib/opportunity-intelligence/executive-opportunity-portfolio-v1";
import type { CrmDirectoryIndexV1 } from "@/lib/relationships-crm/crm-directory-index-v1";

const opportunities = buildExecutiveOpportunityPortfolioV1([{ id: "boeing", name: "Boeing Corporate Art", organization: "Boeing", opportunityType: "brand", status: "research", valueEstimate: null, prestigeScore: null, probabilityScore: null, ownerAgent: "keegan", nextStep: "Identify the decision-maker", nextStepDueAt: null }]);
const crm: CrmDirectoryIndexV1 = {
  people: [{ id: "person:michelle", name: "Michelle", title: null, companyName: "Mercedes-Benz", contactChannels: [], relationshipState: "Waiting On Contact", relationshipStrength: "HIGH", lastTouchAt: "2026-09-11", nextFollowUpAt: "2026-09-22", activeOpportunity: "Mercedes-Benz Masters collaboration", activeAsk: "Wait For Contact", evidenceState: "KNOWN", detailHref: "/relationships/people/person%3Amichelle" }],
  companies: []
};
const context = { home: EXECUTIVE_HOME_FIXTURE_V1, opportunities, crm };

test("Ask Jeeves answers metric questions with reporting range and source", () => {
  const answer = answerAskJeevesV1("How much revenue did we make?", context);
  assert.match(answer.answer, /\$24,800/);
  assert.match(answer.answer, /August 11–17, 2026/);
  assert.deepEqual(answer.sources, ["WooCommerce fixture"]);
});

test("Ask Jeeves resolves named opportunities and CRM relationships to useful deep links", () => {
  const opportunity = answerAskJeevesV1("What is happening with Boeing?", context);
  const relationship = answerAskJeevesV1("What is happening with Michelle?", context);
  assert.match(opportunity.answer, /Identify the decision-maker/);
  assert.equal(opportunity.links[0]?.href, "/opportunities-actions/opportunity/boeing");
  assert.match(relationship.answer, /Mercedes-Benz/);
  assert.equal(relationship.links[0]?.href, "/relationships/people/person%3Amichelle");
});

test("Ask Jeeves is honest about its currently supported reasoning scope", () => {
  const answer = answerAskJeevesV1("Write a new product strategy", context);
  assert.match(answer.answer, /currently answer questions about/);
  assert.doesNotMatch(answer.answer, /definitely|guaranteed/i);
});
