import assert from "node:assert/strict";
import test from "node:test";

import {
  planAskJeevesExternalResearchV1,
  runAskJeevesGovernedResearchV1,
  type AskJeevesResearchStageRequestV1,
} from "@/lib/ask-jeeves/governed-research-runtime-v1";

test("plans separate bounded scout, synthesis, and fresh verifier contexts with task-aware effort", () => {
  const plans = planAskJeevesExternalResearchV1();

  assert.deepEqual(plans.map((plan) => plan.stage), ["SCOUT", "SYNTHESIZE", "VERIFY"]);
  assert.equal(new Set(plans.map((plan) => plan.contextId)).size, 3);
  assert.equal(plans[0].policy.model_tier, "BALANCED");
  assert.equal(plans[0].policy.context_strategy, "EXPANDED_RETRIEVAL");
  assert.equal(plans[1].policy.model_tier, "FRONTIER");
  assert.equal(plans[1].policy.reasoning_effort, "xhigh");
  assert.equal(plans[2].policy.model_tier, "BALANCED");
  assert.equal(plans[2].policy.reasoning_effort, "high");
  for (const plan of plans) {
    assert.ok(plan.policy.budgets.max_runtime_ms > 0);
    assert.ok(plan.policy.budgets.max_output_tokens > 0);
    assert.ok(plan.policy.budgets.max_retries >= 0);
    assert.ok(plan.maxSteps > 0);
  }
});

test("returns only independently verified research and never grants external action authority", async () => {
  const requests: AskJeevesResearchStageRequestV1[] = [];
  const result = await runAskJeevesGovernedResearchV1({
    question: "Which new brand partnership is worth researching?",
    internalEvidence: ["Known relationship evidence A"],
    executor: async (request) => {
      requests.push(request);
      if (request.stage === "SCOUT") {
        return {
          stage: "SCOUT",
          summary: "Two public sources appear relevant.",
          sources: [
            { label: "Primary", href: "https://example.com/source-a" },
            { label: "Duplicate", href: "https://example.com/source-a" },
          ],
        };
      }
      if (request.stage === "SYNTHESIZE") {
        return {
          stage: "SYNTHESIZE",
          answer: "Evidence-backed candidate answer.",
          sources: [{ label: "Second", href: "https://example.org/source-b" }],
        };
      }
      return {
        stage: "VERIFY",
        supported: true,
        reason: "Material claims are source-supported.",
        sources: [{ label: "Verifier corroboration", href: "https://example.net/source-c" }],
      };
    },
  });

  assert.equal(result.status, "VERIFIED");
  assert.equal(result.answer, "Evidence-backed candidate answer.");
  assert.deepEqual(result.sources.map((source) => source.href), [
    "https://example.com/source-a",
    "https://example.org/source-b",
    "https://example.net/source-c",
  ]);
  assert.deepEqual(result.authority, {
    crmMutationAllowed: false,
    outreachAllowed: false,
    publishingAllowed: false,
    spendingAllowed: false,
    approvalBypassAllowed: false,
  });

  assert.deepEqual(requests.map((request) => request.stage), ["SCOUT", "SYNTHESIZE", "VERIFY"]);
  assert.equal(new Set(requests.map((request) => request.contextId)).size, 3);
  const verifyRequest = requests[2];
  assert.equal(verifyRequest.stage, "VERIFY");
  if (verifyRequest.stage === "VERIFY") {
    assert.equal(verifyRequest.candidateAnswer, "Evidence-backed candidate answer.");
    assert.equal("scoutSummary" in verifyRequest, false);
    assert.equal("producerReasoning" in verifyRequest, false);
    assert.deepEqual(verifyRequest.internalEvidence, ["Known relationship evidence A"]);
  }
});

test("fails closed before synthesis when the scout returns no valid web source", async () => {
  let calls = 0;
  const result = await runAskJeevesGovernedResearchV1({
    question: "Research a current opportunity",
    executor: async (request) => {
      calls += 1;
      assert.equal(request.stage, "SCOUT");
      return {
        stage: "SCOUT",
        summary: "No usable source found.",
        sources: [{ label: "Unsafe", href: "file:///tmp/source" }],
      };
    },
  });

  assert.equal(calls, 1);
  assert.equal(result.status, "UNABLE_TO_VERIFY");
  assert.deepEqual(result.reasonCodes, ["NO_WEB_SOURCE"]);
  assert.equal(result.sources.length, 0);
  assert.match(result.answer, /will not fill the gap/i);
});

test("never leaks an unverified candidate answer when the independent verifier rejects support", async () => {
  const result = await runAskJeevesGovernedResearchV1({
    question: "Find a new current opportunity",
    executor: async (request) => {
      if (request.stage === "SCOUT") {
        return {
          stage: "SCOUT",
          summary: "Source lead",
          sources: [{ label: "Source", href: "https://example.com/source" }],
        };
      }
      if (request.stage === "SYNTHESIZE") {
        return {
          stage: "SYNTHESIZE",
          answer: "Unsupported candidate that must not escape.",
          sources: [],
        };
      }
      return {
        stage: "VERIFY",
        supported: false,
        reason: "Material claim is not corroborated.",
        sources: [],
      };
    },
  });

  assert.equal(result.status, "UNABLE_TO_VERIFY");
  assert.deepEqual(result.reasonCodes, ["SOURCE_SUPPORT_NOT_VERIFIED"]);
  assert.doesNotMatch(result.answer, /Unsupported candidate/);
});

test("uses only the bounded policy retry allowance for transient stage failures", async () => {
  let scoutAttempts = 0;
  const result = await runAskJeevesGovernedResearchV1({
    question: "Research a current licensing opportunity",
    executor: async (request) => {
      if (request.stage === "SCOUT") {
        scoutAttempts += 1;
        if (scoutAttempts === 1) throw new Error("transient");
        return {
          stage: "SCOUT",
          summary: "Recovered source lead",
          sources: [{ label: "Source", href: "https://example.com/source" }],
        };
      }
      if (request.stage === "SYNTHESIZE") {
        return {
          stage: "SYNTHESIZE",
          answer: "Supported answer",
          sources: [],
        };
      }
      return {
        stage: "VERIFY",
        supported: true,
        reason: "Verified",
        sources: [{ label: "Verifier", href: "https://example.org/check" }],
      };
    },
  });

  assert.equal(scoutAttempts, 2);
  assert.equal(result.status, "VERIFIED");
});
