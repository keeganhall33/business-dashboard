import fs from 'node:fs';

const text = fs.readFileSync('scripts/orchestration-run-issue-openclaw.mjs', 'utf8');
const checks = [
  ['timeout90', text.includes('Number(arg("--timeout") ?? "90")')],
  ['codingFallback', text.includes('runOpenclaw("coding")')],
  ['extractProjection', text.includes('function extractTextFromProjection(projection)')],
  ['extractFinal', text.includes('function extractAgentFinalText(envelope)')],
  ['envelopeResult', text.includes('envelope?.result')],
  ['resultAgentMeta', text.includes('envelope?.result?.meta?.agentMeta')],
  ['projectionAgentMeta', text.includes('projection?.meta?.agentMeta')],
  ['agentMetaFinal', text.includes('agentMeta?.final')],
  ['agentMetaPayloads', text.includes('agentMeta?.payloads')],
  ['finalTextCall', text.includes('const finalText = extractAgentFinalText(envelope)')],
  ['envelopeShapeFn', text.includes('function envelopeShape(envelope)')],
  ['resultType', text.includes('resultType=')],
  ['resultKeys', text.includes('resultKeys=')],
  ['envelopeShapeCall', text.includes('envelopeShape(envelope)')],
  ['attemptedAgents', text.includes('attemptedAgents=')],
  ['reviewIntent', text.includes('function reviewIntentText(body)')],
  ['reviewIntentUse', text.includes('const text = reviewIntentText(body)')],
  ['prohibitionRegex', text.includes("(?:no\\b|do not\\b|don't\\b|must not\\b|never\\b)")],
  ['noFullBodyScan', !text.includes('const text = String(body ?? "").toLowerCase();')],
  ['authBoundary', text.includes('/\\bauth(?:entication|orization)?\\b/')],
  ['commentsFetched', text.includes('number,title,body,url,comments')],
  ['checkpointIdFn', text.includes('function commentCheckpointId(body)')],
  ['latestApprovalFn', text.includes('function latestApprovedArchitectDecision(comments)')],
  ['approvalMap', text.includes('const approvalsByCheckpoint = new Map()')],
  ['approvalSet', text.includes('approvalsByCheckpoint.set(checkpointId, body)')],
  ['approvalGet', text.includes('approvalsByCheckpoint.get(latestCheckpointId) ?? null')],
  ['approvalReason', text.includes('latest architect checkpoint has a matching subsequent approval')],
  ['recordedDecisionPrompt', text.includes('RECORDED ARCHITECT DECISION (authoritative for this rerun)')],
  ['noRepeatApproval', text.includes('do not ask the same approval question again')],
  ['reviewStreams', text.includes('["CORE_INTELLIGENCE", "DISCOVERY_INTELLIGENCE", "INTELLIGENCE_UX"].includes(stream)')],
  ['reviewGate', text.includes('ARCHITECT_REVIEW_REQUIRED')],
  ['localRoutingEnabled', text.includes('ORCH_LOCAL_ROUTING_ENABLED')],
  ['localAgentId', text.includes('ORCH_LOCAL_AGENT_ID')],
  ['cloudAgentId', text.includes('ORCH_CLOUD_AGENT_ID')],
  ['autoContinueClass', text.includes('classified.executionClass === "AUTO_CONTINUE"')],
  ['localFirstHelper', text.includes('executeAutoContinueWithLocalFirstV1')],
  ['runWithPrompt', text.includes('runOpenclawWithPrompt')],
  ['cloudAgentArg', text.includes('cloudAgentId: ORCH_CLOUD_AGENT_ID')],
  ['localAgentArg', text.includes('localAgentId: ORCH_LOCAL_AGENT_ID')],
  ['routingMeta', text.includes('routingMeta()')],
  ['executeNow', text.includes('EXECUTE IMPLEMENTATION NOW')],
  ['noReReview', text.includes('Do not merely review, approve, summarize, or restate the task')],
  ['oldPromptGone', !text.includes('Do not run tools unless explicitly required; prefer a concise result.')]
];

for (let i = 0; i < checks.length; i += 1) {
  const [name, ok] = checks[i];
  if (!ok) {
    console.error(`FAILED_INVARIANT:${i + 1}:${name}`);
    process.exit(Math.min(i + 1, 120));
  }
}
console.log(`ALL_INVARIANTS_PASS:${checks.length}`);
