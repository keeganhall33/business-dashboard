import assert from "node:assert/strict";
import test from "node:test";

import {
  AGENT_EXECUTION_SEQUENCE,
  AGENT_OPERATING_MODELS,
  getAgentOperatingModel
} from "@/lib/agents/operating-model";

test("Avery is the canonical first agent in every multi-agent decision cycle", () => {
  assert.deepEqual(AGENT_EXECUTION_SEQUENCE, ["avery", "sloan", "lyra", "noah"]);
});

test("each agent has a distinct modern mandate and weekly contract", () => {
  const avery = AGENT_OPERATING_MODELS.avery;
  const sloan = AGENT_OPERATING_MODELS.sloan;
  const lyra = AGENT_OPERATING_MODELS.lyra;
  const noah = AGENT_OPERATING_MODELS.noah;

  assert.match(avery.roleTitle, /Executive Strategy/);
  assert.match(avery.mandate, /binding constraint/i);

  assert.match(sloan.roleTitle, /Revenue & Commerce/);
  assert.deepEqual(sloan.careerLanes, ["REVENUE"]);

  assert.match(lyra.roleTitle, /Brand, Audience & Cultural/);
  assert.deepEqual(lyra.careerLanes, ["AUDIENCE", "OWNED_FUTURE"]);

  assert.match(noah.roleTitle, /External Intelligence/);
  assert.deepEqual(noah.careerLanes, ["RELATIONSHIP", "CAREER"]);
  assert.ok(noah.responsibilities.some((item) => /Opportunity Radar/i.test(item)));
  assert.ok(noah.responsibilities.some((item) => /reverse engineer/i.test(item)));

  assert.notDeepEqual(avery.weeklyOutputRequirements, sloan.weeklyOutputRequirements);
  assert.notDeepEqual(sloan.weeklyOutputRequirements, lyra.weeklyOutputRequirements);
  assert.notDeepEqual(lyra.weeklyOutputRequirements, noah.weeklyOutputRequirements);
});

test("canonical roles enforce evidence and anti-fabrication guardrails", () => {
  assert.ok(AGENT_OPERATING_MODELS.avery.guardrails.some((item) => /Optimize the business/i.test(item)));
  assert.ok(AGENT_OPERATING_MODELS.sloan.guardrails.some((item) => /repeatedly recommend/i.test(item)));
  assert.ok(AGENT_OPERATING_MODELS.lyra.guardrails.some((item) => /generic|posting volume/i.test(item)));
  assert.ok(AGENT_OPERATING_MODELS.noah.guardrails.some((item) => /fake|fabricat|unsupported/i.test(item)));
});

test("unknown agent keys do not silently inherit a role", () => {
  assert.equal(getAgentOperatingModel("unknown"), null);
});
