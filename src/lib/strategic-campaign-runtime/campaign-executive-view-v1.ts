import { createHash } from "node:crypto";

import type { CampaignEventLinkResultV1 } from "@/lib/strategic-campaign-runtime/campaign-event-linker-v1";
import type { CampaignSteeringSnapshotV1 } from "@/lib/strategic-campaign-runtime/campaign-steering-v1";
import type { CampaignWorkflowTaskV1 } from "@/lib/strategic-campaign-runtime/campaign-workflow-adapter-v1";

export const CAMPAIGN_EXECUTIVE_VIEW_POLICY_VERSION_V1 =
  "campaign_executive_view_v1.0.0" as const;

export type CampaignExecutiveTruthStateV1 = "CURRENT" | "STALE" | "UNKNOWN" | "CONFLICTED";
export type CampaignExecutiveStatusV1 =
  | "DRAFT"
  | "ACTIVE"
  | "WAITING"
  | "BLOCKED_APPROVAL"
  | "SUCCEEDED"
  | "KILLED";
export type CampaignExecutiveHealthV1 = "HEALTHY" | "WAITING" | "BLOCKED" | "STALE" | "TERMINAL" | "UNKNOWN";

export type CampaignExecutiveEvidenceV1 = {
  evidenceRef: string;
  summary: string;
  truthState: CampaignExecutiveTruthStateV1;
  observedAt: string;
};

export type CampaignExecutiveAccessPathV1 = {
  pathId: string;
  relationshipRef: string;
  label: string;
  isPrimary: boolean;
  authority: readonly string[];
  truthState: CampaignExecutiveTruthStateV1;
  evidenceRefs: readonly string[];
};

export type CampaignExecutiveIndicatorV1 = {
  metricRef: string;
  label: string;
  truthState: CampaignExecutiveTruthStateV1;
  value: number | null;
  unit: string | null;
  evidenceRefs: readonly string[];
};

export type CampaignExecutiveViewInputV1 = {
  snapshot: CampaignSteeringSnapshotV1;
  evaluatedAt: string;
  campaignTruthState: CampaignExecutiveTruthStateV1;
  evidence: readonly CampaignExecutiveEvidenceV1[];
  accessPaths: readonly CampaignExecutiveAccessPathV1[];
  workflowTasks: readonly CampaignWorkflowTaskV1[];
  eventLinks: readonly CampaignEventLinkResultV1[];
  leadingIndicators: readonly CampaignExecutiveIndicatorV1[];
  previousMaterialFingerprint?: string | null;
};

export type CampaignExecutiveApprovalV1 = {
  actionId: string;
  approvalClass: "REVIEW" | "KEEGAN";
  source: "WORKFLOW" | "EVENT";
  evidenceRefs: readonly string[];
};

export type CampaignExecutivePlanChangeV1 = {
  version: number;
  revisedAt: string;
  reason: string;
};

export type CampaignExecutiveMaterialDeltaV1 = {
  fingerprint: string;
  reasons: readonly string[];
  eventIds: readonly string[];
  evidenceRefs: readonly string[];
};

export type CampaignExecutiveViewV1 = {
  contractVersion: "CampaignExecutiveViewV1";
  policyVersion: typeof CAMPAIGN_EXECUTIVE_VIEW_POLICY_VERSION_V1;
  campaignId: string;
  objective: string;
  successConditionRefs: readonly string[];
  executiveStatus: CampaignExecutiveStatusV1;
  trajectory: "ADVANCING" | "WAITING" | "BLOCKED" | "TERMINAL" | "UNKNOWN";
  health: CampaignExecutiveHealthV1;
  truthState: CampaignExecutiveTruthStateV1;
  currentPlan: {
    version: number;
    summary: string;
    pendingStepIds: readonly string[];
  };
  nextBestStep: string | null;
  waitOrBlockReason: string | null;
  nextWakeCondition: string | null;
  accessPaths: readonly CampaignExecutiveAccessPathV1[];
  newestMaterialEvidence: CampaignExecutiveEvidenceV1 | null;
  lastPlanChange: CampaignExecutivePlanChangeV1 | null;
  approvalsNeeded: readonly CampaignExecutiveApprovalV1[];
  leadingIndicators: readonly CampaignExecutiveIndicatorV1[];
  killCriteriaRefs: readonly string[];
  closedOutcome: {
    state: "SUCCEEDED" | "KILLED";
    reason: string;
  } | null;
  materialFingerprint: string;
  materialDelta: CampaignExecutiveMaterialDeltaV1 | null;
  drilldown: {
    campaignRef: string;
    planRefs: readonly string[];
    historyRefs: readonly string[];
    evidenceRefs: readonly string[];
    workflowTaskRefs: readonly string[];
    eventRefs: readonly string[];
  };
  actionAuthority: {
    readOnlyProjection: true;
    campaignMutationAuthorized: false;
    workflowDispatchAuthorized: false;
    externalActionAuthorized: false;
    outreachAuthorized: false;
    approvalBypassAuthorized: false;
  };
};

export class CampaignExecutiveViewError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "CampaignExecutiveViewError";
  }
}

const MAX_ITEMS = 100;
const MAX_TEXT = 1_000;

function required(value: unknown, label: string, max = MAX_TEXT): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new CampaignExecutiveViewError("REQUIRED_FIELD", `${label} is required`);
  }
  const normalized = value.trim();
  if (normalized.length > max) {
    throw new CampaignExecutiveViewError("BOUNDS_EXCEEDED", `${label} exceeds ${max} characters`);
  }
  return normalized;
}

function timestamp(value: unknown, label: string): string {
  const normalized = required(value, label, 128);
  if (!Number.isFinite(Date.parse(normalized))) {
    throw new CampaignExecutiveViewError("INVALID_TIMESTAMP", `${label} must be a valid timestamp`);
  }
  return new Date(Date.parse(normalized)).toISOString();
}

function bounded<T>(values: readonly T[], label: string): readonly T[] {
  if (!Array.isArray(values) || values.length > MAX_ITEMS) {
    throw new CampaignExecutiveViewError("BOUNDS_EXCEEDED", `${label} exceeds supported bounds`);
  }
  return values;
}

function sortedUnique(values: readonly string[], label: string): string[] {
  return [...new Set(bounded(values, label).map((value) => required(value, label, 256)))].sort((a, b) =>
    a.localeCompare(b)
  );
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value as Record<string, unknown>)
      .sort()
      .map((key) => [key, canonical((value as Record<string, unknown>)[key])])
  );
}

function fingerprint(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex").slice(0, 32);
}

function freeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) freeze(child);
  }
  return value;
}

function normalizeEvidence(values: readonly CampaignExecutiveEvidenceV1[]): CampaignExecutiveEvidenceV1[] {
  const seen = new Set<string>();
  return bounded(values, "evidence")
    .map((item) => ({
      evidenceRef: required(item.evidenceRef, "evidence.evidenceRef", 256),
      summary: required(item.summary, "evidence.summary"),
      truthState: item.truthState,
      observedAt: timestamp(item.observedAt, "evidence.observedAt")
    }))
    .filter((item) => {
      if (seen.has(item.evidenceRef)) return false;
      seen.add(item.evidenceRef);
      return true;
    })
    .sort((a, b) => Date.parse(b.observedAt) - Date.parse(a.observedAt) || a.evidenceRef.localeCompare(b.evidenceRef));
}

function normalizeAccessPaths(values: readonly CampaignExecutiveAccessPathV1[]): CampaignExecutiveAccessPathV1[] {
  const seen = new Set<string>();
  return bounded(values, "accessPaths")
    .map((item) => ({
      pathId: required(item.pathId, "accessPath.pathId", 256),
      relationshipRef: required(item.relationshipRef, "accessPath.relationshipRef", 256),
      label: required(item.label, "accessPath.label", 256),
      isPrimary: item.isPrimary === true,
      authority: sortedUnique(item.authority, "accessPath.authority"),
      truthState: item.truthState,
      evidenceRefs: sortedUnique(item.evidenceRefs, "accessPath.evidenceRefs")
    }))
    .filter((item) => {
      if (seen.has(item.pathId)) return false;
      seen.add(item.pathId);
      return true;
    })
    .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary) || a.pathId.localeCompare(b.pathId));
}

function normalizeIndicators(values: readonly CampaignExecutiveIndicatorV1[]): CampaignExecutiveIndicatorV1[] {
  const seen = new Set<string>();
  return bounded(values, "leadingIndicators")
    .map((item) => {
      const supported = item.evidenceRefs.length > 0 && ["CURRENT", "STALE"].includes(item.truthState);
      return {
        metricRef: required(item.metricRef, "indicator.metricRef", 256),
        label: required(item.label, "indicator.label", 256),
        truthState: item.truthState,
        value: supported && typeof item.value === "number" && Number.isFinite(item.value) ? item.value : null,
        unit: item.unit == null ? null : required(item.unit, "indicator.unit", 64),
        evidenceRefs: sortedUnique(item.evidenceRefs, "indicator.evidenceRefs")
      };
    })
    .filter((item) => {
      if (seen.has(item.metricRef)) return false;
      seen.add(item.metricRef);
      return true;
    })
    .sort((a, b) => a.metricRef.localeCompare(b.metricRef));
}

function validateOwnedTasks(snapshot: CampaignSteeringSnapshotV1, tasks: readonly CampaignWorkflowTaskV1[]): CampaignWorkflowTaskV1[] {
  return bounded(tasks, "workflowTasks")
    .filter((task) => task.campaignId === snapshot.run.id && task.planVersion === snapshot.run.planVersion)
    .sort((a, b) => a.stepId.localeCompare(b.stepId));
}

function validateOwnedEvents(snapshot: CampaignSteeringSnapshotV1, events: readonly CampaignEventLinkResultV1[]): CampaignEventLinkResultV1[] {
  return bounded(events, "eventLinks")
    .filter((event) => event.campaignId === snapshot.run.id)
    .sort((a, b) => a.eventId.localeCompare(b.eventId));
}

function approvals(
  tasks: readonly CampaignWorkflowTaskV1[],
  events: readonly CampaignEventLinkResultV1[]
): CampaignExecutiveApprovalV1[] {
  const values: CampaignExecutiveApprovalV1[] = [];
  for (const task of tasks) {
    if (task.approvalClass === "NONE") continue;
    values.push({
      actionId: task.taskId,
      approvalClass: task.approvalClass,
      source: "WORKFLOW",
      evidenceRefs: [...task.evidenceRefs]
    });
  }
  for (const event of events) {
    if (!event.outboundApproval) continue;
    values.push({
      actionId: event.outboundApproval.actionId,
      approvalClass: event.outboundApproval.approvalClass,
      source: "EVENT",
      evidenceRefs: [...event.evidenceRefs]
    });
  }
  const unique = new Map<string, CampaignExecutiveApprovalV1>();
  for (const value of values) {
    const key = `${value.source}:${value.actionId}`;
    if (!unique.has(key)) unique.set(key, value);
  }
  return [...unique.values()].sort(
    (a, b) => a.approvalClass.localeCompare(b.approvalClass) || a.actionId.localeCompare(b.actionId)
  );
}

function executiveStatus(
  snapshot: CampaignSteeringSnapshotV1,
  pendingApprovals: readonly CampaignExecutiveApprovalV1[]
): CampaignExecutiveStatusV1 {
  if (snapshot.run.state === "ACTIVE" && pendingApprovals.length > 0) return "BLOCKED_APPROVAL";
  return snapshot.run.state;
}

function trajectory(status: CampaignExecutiveStatusV1): CampaignExecutiveViewV1["trajectory"] {
  if (status === "ACTIVE") return "ADVANCING";
  if (status === "WAITING") return "WAITING";
  if (status === "BLOCKED_APPROVAL") return "BLOCKED";
  if (status === "SUCCEEDED" || status === "KILLED") return "TERMINAL";
  return "UNKNOWN";
}

function health(
  status: CampaignExecutiveStatusV1,
  truthState: CampaignExecutiveTruthStateV1
): CampaignExecutiveHealthV1 {
  if (status === "SUCCEEDED" || status === "KILLED") return "TERMINAL";
  if (truthState === "STALE") return "STALE";
  if (truthState === "UNKNOWN" || truthState === "CONFLICTED") return "UNKNOWN";
  if (status === "WAITING") return "WAITING";
  if (status === "BLOCKED_APPROVAL") return "BLOCKED";
  if (status === "ACTIVE") return "HEALTHY";
  return "UNKNOWN";
}

function waitReason(snapshot: CampaignSteeringSnapshotV1): string | null {
  if (snapshot.run.state !== "WAITING") return null;
  const event = [...snapshot.run.history]
    .reverse()
    .find((item) => item.type === "TRANSITIONED" && item.detail.to === "WAITING");
  const value = event?.detail.waitReason ?? event?.detail.reason;
  return typeof value === "string" && value.trim() ? value.trim() : "Waiting reason is not recorded.";
}

function nextWake(snapshot: CampaignSteeringSnapshotV1): string | null {
  const condition = snapshot.run.wakeCondition;
  return condition ? `${condition.kind}:${condition.value}` : null;
}

function currentPlan(snapshot: CampaignSteeringSnapshotV1): CampaignExecutiveViewV1["currentPlan"] {
  const plan = snapshot.run.plans.find((item) => item.version === snapshot.run.planVersion);
  if (!plan) {
    throw new CampaignExecutiveViewError("CURRENT_PLAN_MISSING", "current plan version is missing");
  }
  const completed = new Set(snapshot.completedStepIds);
  return {
    version: plan.version,
    summary: plan.objective,
    pendingStepIds: plan.steps.filter((step) => !completed.has(step))
  };
}

function lastPlanChange(snapshot: CampaignSteeringSnapshotV1): CampaignExecutivePlanChangeV1 | null {
  const plan = snapshot.run.plans.find((item) => item.version === snapshot.run.planVersion);
  return plan
    ? { version: plan.version, revisedAt: plan.revisedAt, reason: plan.revisionReason }
    : null;
}

function boundaryRef(prefix: string, value: { metric: string; operator: string; value: number }): string {
  return `${prefix}:${value.metric}:${value.operator}:${value.value}`;
}

function eventMaterialReasons(events: readonly CampaignEventLinkResultV1[]): {
  reasons: string[];
  eventIds: string[];
  evidenceRefs: string[];
} {
  const material = events.filter((event) => event.disposition === "UPDATE_EXISTING");
  return {
    reasons: [...new Set(material.map((event) => event.materialChange).filter((value): value is string => Boolean(value)))].sort(),
    eventIds: [...new Set(material.map((event) => event.eventId))].sort(),
    evidenceRefs: [...new Set(material.flatMap((event) => event.evidenceRefs))].sort()
  };
}

export function projectCampaignExecutiveViewV1(
  input: CampaignExecutiveViewInputV1
): CampaignExecutiveViewV1 {
  if (!input || typeof input !== "object" || !input.snapshot?.run) {
    throw new CampaignExecutiveViewError("INVALID_INPUT", "campaign snapshot is required");
  }
  timestamp(input.evaluatedAt, "evaluatedAt");
  const snapshot = input.snapshot;
  const evidence = normalizeEvidence(input.evidence);
  const accessPaths = normalizeAccessPaths(input.accessPaths);
  const indicators = normalizeIndicators(input.leadingIndicators);
  const tasks = validateOwnedTasks(snapshot, input.workflowTasks);
  const events = validateOwnedEvents(snapshot, input.eventLinks);
  const pendingApprovals = approvals(tasks, events);
  const status = executiveStatus(snapshot, pendingApprovals);
  const plan = currentPlan(snapshot);
  const newestMaterialEvidence = evidence.find((item) => item.truthState === "CURRENT") ?? evidence[0] ?? null;
  const materialEvents = eventMaterialReasons(events);
  const truthReasons = input.campaignTruthState === "CURRENT" ? [] : [`TRUTH_${input.campaignTruthState}`];
  const approvalReasons = pendingApprovals.length > 0 ? ["APPROVAL_REQUIRED"] : [];
  const stateReasons =
    status === "WAITING"
      ? ["CAMPAIGN_WAITING"]
      : status === "SUCCEEDED" || status === "KILLED"
        ? [`CAMPAIGN_${status}`]
        : [];
  const reasons = [...new Set([...materialEvents.reasons, ...truthReasons, ...approvalReasons, ...stateReasons])].sort();

  const materialState = {
    campaignId: snapshot.run.id,
    status,
    truthState: input.campaignTruthState,
    planVersion: snapshot.run.planVersion,
    pendingStepIds: plan.pendingStepIds,
    approvals: pendingApprovals.map((item) => `${item.source}:${item.actionId}:${item.approvalClass}`),
    wait: waitReason(snapshot),
    wake: nextWake(snapshot),
    terminalReason: snapshot.run.terminalReason,
    access: accessPaths.map((item) => ({
      pathId: item.pathId,
      isPrimary: item.isPrimary,
      authority: item.authority,
      truthState: item.truthState,
      evidenceRefs: item.evidenceRefs
    })),
    indicators,
    materialEventFingerprints: events
      .filter((event) => event.disposition === "UPDATE_EXISTING")
      .map((event) => event.eventFingerprint)
      .sort(),
    newestMaterialEvidenceRef: newestMaterialEvidence?.evidenceRef ?? null
  };
  const materialFingerprint = fingerprint(materialState);
  const sameAsPrevious = input.previousMaterialFingerprint === materialFingerprint;
  const deltaReasons = sameAsPrevious ? [] : reasons;
  const materialDelta =
    sameAsPrevious || deltaReasons.length === 0
      ? null
      : {
          fingerprint: materialFingerprint,
          reasons: deltaReasons,
          eventIds: materialEvents.eventIds,
          evidenceRefs: [...new Set([
            ...materialEvents.evidenceRefs,
            ...pendingApprovals.flatMap((item) => item.evidenceRefs),
            ...(newestMaterialEvidence ? [newestMaterialEvidence.evidenceRef] : [])
          ])].sort()
        };

  const blockedReason =
    status === "BLOCKED_APPROVAL"
      ? `Approval required for ${pendingApprovals.length} prepared action${pendingApprovals.length === 1 ? "" : "s"}.`
      : waitReason(snapshot);
  const nextBestStep =
    status === "ACTIVE" && plan.pendingStepIds.length > 0
      ? plan.pendingStepIds[0]
      : status === "BLOCKED_APPROVAL" || status === "WAITING" || status === "SUCCEEDED" || status === "KILLED"
        ? null
        : plan.pendingStepIds[0] ?? null;

  const allEvidenceRefs = [...new Set([
    ...evidence.map((item) => item.evidenceRef),
    ...accessPaths.flatMap((item) => item.evidenceRefs),
    ...indicators.flatMap((item) => item.evidenceRefs),
    ...tasks.flatMap((item) => item.evidenceRefs),
    ...events.flatMap((item) => item.evidenceRefs)
  ])].sort();

  const result: CampaignExecutiveViewV1 = {
    contractVersion: "CampaignExecutiveViewV1",
    policyVersion: CAMPAIGN_EXECUTIVE_VIEW_POLICY_VERSION_V1,
    campaignId: snapshot.run.id,
    objective: snapshot.run.objective,
    successConditionRefs: snapshot.run.successConditions.map((item) => boundaryRef("success", item)).sort(),
    executiveStatus: status,
    trajectory: trajectory(status),
    health: health(status, input.campaignTruthState),
    truthState: input.campaignTruthState,
    currentPlan: plan,
    nextBestStep,
    waitOrBlockReason: blockedReason,
    nextWakeCondition: nextWake(snapshot),
    accessPaths,
    newestMaterialEvidence,
    lastPlanChange: lastPlanChange(snapshot),
    approvalsNeeded: pendingApprovals,
    leadingIndicators: indicators,
    killCriteriaRefs: snapshot.run.killConditions.map((item) => boundaryRef("kill", item)).sort(),
    closedOutcome:
      snapshot.run.state === "SUCCEEDED" || snapshot.run.state === "KILLED"
        ? {
            state: snapshot.run.state,
            reason: snapshot.run.terminalReason ?? "Terminal reason is not recorded."
          }
        : null,
    materialFingerprint,
    materialDelta,
    drilldown: {
      campaignRef: `campaign:${snapshot.run.id}`,
      planRefs: snapshot.run.plans.map((item) => `campaign:${snapshot.run.id}:plan:${item.version}`),
      historyRefs: snapshot.run.history.map((item) => `campaign:${snapshot.run.id}:history:${item.sequence}`),
      evidenceRefs: allEvidenceRefs,
      workflowTaskRefs: tasks.map((task) => `workflow:${task.taskId}`),
      eventRefs: events.map((event) => `event:${event.eventId}`)
    },
    actionAuthority: {
      readOnlyProjection: true,
      campaignMutationAuthorized: false,
      workflowDispatchAuthorized: false,
      externalActionAuthorized: false,
      outreachAuthorized: false,
      approvalBypassAuthorized: false
    }
  };

  return freeze(result);
}
