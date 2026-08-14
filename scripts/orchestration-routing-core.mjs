function parseLooseJsonCandidate(text) {
  const raw = String(text ?? "");
  const fenced = raw.match(/```json\n([\s\S]*?)```/i);
  const candidate = (fenced ? fenced[1] : raw).trim();

  // Best-effort extraction: some local models may prepend a short line.
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  const slice = candidate.slice(start, end + 1).trim();
  try {
    return JSON.parse(slice);
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
    cloudForbidden,
    verifyStructuredResult,
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

      if (typeof verifyStructuredResult === "function") {
        const verification = verifyStructuredResult({ parsed, envelope, finalText, agentId });
        if (verification && verification.ok === false) {
          return { ok: false, kind: verification.kind ?? "INVALID_STRUCTURED_OUTPUT", raw, envelope, finalText };
        }
      }

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

  if (cloudForbidden || !cloudAgentId) {
    routingState.escalatedToCloud = false;
    routingState.escalationReason = null;
    return { final: second, coerced: null };
  }

  routingState.escalatedToCloud = true;
  routingState.escalationReason = "LOCAL_INVALID_STRUCTURED_OUTPUT";
  const cloud = await attempt(cloudAgentId, promptText);
  return { final: cloud, coerced: null };
}
