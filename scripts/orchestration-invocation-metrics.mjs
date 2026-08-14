import crypto from "node:crypto";

export function createInvocationTrackerV1(input) {
  const attemptId = String(input?.attemptId ?? crypto.randomUUID());
  let attemptIndex = 0;
  const events = [];

  const record = (agentId, kind) => {
    attemptIndex += 1;
    events.push({ attemptId, attemptIndex, agentId: String(agentId), kind: String(kind) });
  };

  const actualLocalInvocations = () => events.filter((e) => e.kind === "local").length;
  const actualCloudInvocations = () => events.filter((e) => e.kind === "cloud").length;
  const attemptedAgentsRecorded = () => events.map((e) => e.agentId);

  return {
    attemptId,
    record,
    events,
    actualLocalInvocations,
    actualCloudInvocations,
    attemptedAgentsRecorded
  };
}

