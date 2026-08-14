// Agent selection is an orchestration control-plane concern.
// It must be decided BEFORE execution-class branching so that approved
// implementation/proof runs preserve the worker identity.

export function selectWorkerLocalAgentIdV1(stream) {
  const s = String(stream ?? "").trim();
  if (s === "CORE_INTELLIGENCE") return "local-a";
  if (s === "DISCOVERY_INTELLIGENCE") return "local-b";
  if (s === "INTELLIGENCE_UX" || s === "INTELLIGENCE_UX / PRODUCTION_VALUE") return "local-c";
  if (s === "AGENT_ORCHESTRATION" || s === "ORCHESTRATION_SYSTEMS" || s === "AGENT_ORCHESTRATION / ORCHESTRATION_SYSTEMS") return "local-d";
  return null;
}

export function shouldEnableLocalRoutingV1({ stream, explicitLocalAgentId, explicitLocalRoutingEnabled }) {
  if (explicitLocalRoutingEnabled) return true;
  if (String(explicitLocalAgentId ?? "").trim()) return true;
  return Boolean(selectWorkerLocalAgentIdV1(stream));
}

