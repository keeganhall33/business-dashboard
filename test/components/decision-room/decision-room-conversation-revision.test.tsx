import assert from "node:assert/strict";
import test from "node:test";

import React from "react";
import { renderToString } from "react-dom/server";

import { DecisionRoomConversationRevision } from "@/components/decision-room/DecisionRoomConversationRevision";
import { DecisionRoom } from "@/components/intelligence-ux/DecisionRoom";
import {
  CONVERSATION_REVISION_TEXT_FACT_PREVIEW_V1,
  CONVERSATION_REVISION_TRANSCRIPT_FACT_PREVIEW_V1
} from "@/lib/decision-intelligence/conversation-revision/fixtures";
import { RECOMMENDATION_REVISION_HYPOTHETICAL_RESULT_V1 } from "@/lib/decision-intelligence/revision/fixtures";
import { DECISION_ROOM_FIXTURE_V1 } from "@/lib/decision-room/fixtures";

test("Decision Room renders conversation answer and recommendation version diff in one flow", () => {
  const html = renderToString(<DecisionRoom decision={DECISION_ROOM_FIXTURE_V1} />);

  assert.match(html, /Conversational decision panel/);
  assert.match(html, /Why are you recommending validation instead of building the private collector room now/);
  assert.match(html, /Grounded answer/);
  assert.match(html, /New information preview/);
  assert.match(html, /Recommendation version 1 to 2/);
  assert.match(html, /Before/);
  assert.match(html, /After/);
  assert.match(html, /WHY_CHANGED/);
  assert.match(html, /Human-reported fact resolves the access-route unknown/);
});

test("old recommendation remains inspectable while active recommendation moves to N plus 1", () => {
  const html = renderToString(<DecisionRoomConversationRevision />);

  assert.match(html, /Old recommendation remains inspectable/);
  assert.match(html, /Preserved versions: Version 1/);
  assert.match(html, /Inspectable=true/);
  assert.match(html, /Validate access before investing in a full prestige-event concept/);
  assert.match(html, /Use the confirmed warm host introduction to validate access/);
});

test("text and voice transcript use the same canonical revision semantics", () => {
  assert.equal(CONVERSATION_REVISION_TEXT_FACT_PREVIEW_V1.normalized_utterance, CONVERSATION_REVISION_TRANSCRIPT_FACT_PREVIEW_V1.normalized_utterance);
  assert.equal(CONVERSATION_REVISION_TEXT_FACT_PREVIEW_V1.classification, CONVERSATION_REVISION_TRANSCRIPT_FACT_PREVIEW_V1.classification);
  assert.deepEqual(
    CONVERSATION_REVISION_TEXT_FACT_PREVIEW_V1.recommendation_version_diff?.after,
    CONVERSATION_REVISION_TRANSCRIPT_FACT_PREVIEW_V1.recommendation_version_diff?.after
  );

  const html = renderToString(<DecisionRoomConversationRevision />);
  assert.match(html, /voice\/text canonical=true/);
  assert.match(html, /VOICE_TRANSCRIPT/);
});

test("hypothetical input cannot appear as fact or mutate fixture memory", () => {
  const html = renderToString(<DecisionRoomConversationRevision />);

  assert.equal(RECOMMENDATION_REVISION_HYPOTHETICAL_RESULT_V1.facts_mutated, false);
  assert.equal(RECOMMENDATION_REVISION_HYPOTHETICAL_RESULT_V1.memory_mutated, false);
  assert.equal(RECOMMENDATION_REVISION_HYPOTHETICAL_RESULT_V1.hypothetical_not_promoted_to_fact, true);
  assert.match(html, /Hypothetical guardrail/);
  assert.match(html, /HYPOTHETICAL \/ HYPOTHETICAL_ONLY/);
  assert.match(html, /facts_mutated=false memory_mutated=false/);
});

test("UNKNOWN and CONFLICTED states stay visible in light-mode responsive markup", () => {
  const html = renderToString(<DecisionRoomConversationRevision />);

  assert.match(html, /UNKNOWN remains explicit/);
  assert.match(html, /UNKNOWN: Direct event economics/);
  assert.match(html, /CONFLICTED preview/);
  assert.match(html, /Reported intro exists, but decision-maker access is conflicted/);
  assert.match(html, /bg-white/);
  assert.match(html, /md:grid-cols-3/);
  assert.match(html, /lg:grid-cols-2/);
});
