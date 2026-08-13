function parseLooseJsonCandidate(text) {
  const fenced = String(text ?? "").match(/```json\n([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : String(text ?? "");
  const trimmed = candidate.trim();
  if (!trimmed.startsWith("{")) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

export async function executeAutoContinueWithLocalFirstV1(input) {
  const {
    taskId,
    taskBody,
    promptText,
    strictRetryPrompt,
    localRoutingEnabled,
    localAgentId,
    cloudAgentId,
    run,
    routingState,
    extractFinalText,
    parseStructured,
    deltaDemandsPass,
    coerceLooseJsonToResultContract
  } = input;

  const attempt = async (agentId, message) => {
    routingState.attemptedAgents.push(agentId);
    const raw = await run(agentId, message);
    let envelope;
    try {
      envelope = JSON.parse(String(raw ?? ""));
    } catch {
      return { ok: false, kind: "INVALID_STRUCTURED_OUTPUT", raw: String(raw ?? ""), envelope: null, finalText: "" };
    }

    const finalText = extractFinalText(envelope);
    try {
      const parsed = parseStructured(finalText);
      if (parsed.kind === "invalid") return { ok: false, kind: "INVALID_STRUCTURED_OUTPUT", raw, envelope, finalText };
      return { ok: true, kind: parsed.kind, value: parsed.value, raw, envelope, finalText };
    } catch {
      return { ok: false, kind: "INVALID_STRUCTURED_OUTPUT", raw, envelope, finalText };
    }
  };

  routingState.localAttempted = localRoutingEnabled;

  if (!localRoutingEnabled) {
    const cloud = await attempt(cloudAgentId, promptText);
    return { final: cloud, coerced: null };
  }

  const first = await attempt(localAgentId, promptText);
  if (first.ok) return { final: first, coerced: null };
  routingState.localResult = "INVALID_STRUCTURED_OUTPUT";

  const second = await attempt(localAgentId, strictRetryPrompt);
  if (deltaDemandsPass(taskBody)) {
    const obj = parseLooseJsonCandidate(second.finalText);
    const coerced = coerceLooseJsonToResultContract(obj, taskId);
    if (coerced) {
      // Treat as local success for PASS-proof tasks even if the model returned only a small success JSON.
      routingState.localResult = "SUCCESS";
      return { final: second, coerced };
    }
  }

  if (second.ok) return { final: second, coerced: null };

  routingState.escalatedToCloud = true;
  routingState.escalationReason = "LOCAL_INVALID_STRUCTURED_OUTPUT";
  const cloud = await attempt(cloudAgentId, promptText);
  return { final: cloud, coerced: null };
}
