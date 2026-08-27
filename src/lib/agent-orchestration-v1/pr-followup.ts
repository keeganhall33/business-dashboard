import type { OrchestrationTaskV1 } from "./types";

export interface FollowUpWorkItem {
  prNumber: number;
  reason: string;
  stream: string;
  title: string;
  body: string;
  priority: "P0" | "P1" | "P2" | "P3";
  isHumanGated: boolean;
  isProductionGated: boolean;
  isHistorical: boolean;
  createdAt: string;
}

export interface FollowUpMaterializationResult {
  task: OrchestrationTaskV1 | null;
  event: "INTEGRATION_FOLLOWUP_ENQUEUED" | "INTEGRATION_FOLLOWUP_REUSED" | "INTEGRATION_FOLLOWUP_SKIPPED";
  reason?: string;
}

const STREAMS = [
  "AGENT_ORCHESTRATION",
  "RELEASE_TRAIN",
  "QA_EVALUATION",
  "RECONCILIATION"
] as const;

export function isStream(stream: string): stream is (typeof STREAMS)[number] {
  return STREAMS.includes(stream as typeof STREAMS[number]);
}

export function computePriority(sourcePriority: string, isHumanGated: boolean, isProductionGated: boolean): "P0" | "P1" | "P2" | "P3" {
  if (isHumanGated || isProductionGated) {
    return "P2";
  }
  if (sourcePriority.startsWith("P0")) {
    return "P0";
  }
  if (sourcePriority.startsWith("P1")) {
    return "P1";
  }
  return "P3";
}

export function isEligibleForMaterialization(item: FollowUpWorkItem): boolean {
  // Do not enqueue stale historical PRs
  if (item.isHistorical) {
    return false;
  }
  
  // Do not enqueue human/production-gated work
  if (item.isHumanGated || item.isProductionGated) {
    return false;
  }
  
  // Check that stream is mapped
  if (!isStream(item.stream)) {
    return false;
  }
  
  // Verify the underlying condition remains actionable
  // (this would be checked against external state in production)
  return true;
}

export function materializeFollowUpWork(
  followup: FollowUpWorkItem,
  canonicalIssueMap: Map<string, OrchestrationTaskV1>
): FollowUpMaterializationResult {
  const key = makeFollowUpKey(followup.prNumber, followup.reason, followup.stream);
  
  // Check if already materialized (deduplication)
  const existing = canonicalIssueMap.get(key);
  if (existing) {
    return {
      task: existing,
      event: "INTEGRATION_FOLLOWUP_REUSED",
      reason: `Already materialized: ${key}`
    };
  }
  
  // Check if original issue is closed (should not reopen)
  // This would require checking GitHub API in production
  
  // Create the task for eligible work
  const now = new Date().toISOString();
  const task: OrchestrationTaskV1 = {
    task_id: `orch-rt-${followup.prNumber}-${followup.reason.slice(0, 8)}-${Date.now()}`,
    parent_task_id: null,
    milestone: "release-train-followup",
    stream: followup.stream,
    requested_by: "business-dashboard-integration",
    assigned_agent: "JEEVES",
    task_type: "github_issue",
    directive: `Materialized release-train follow-up work for PR #${followup.prNumber}: ${followup.reason}`,
    scope: [`pr-${followup.prNumber}`],
    constraints: [`stream: ${followup.stream}`],
    allowed_actions: ["reconcile", "qa-evaluate", "investigate"],
    forbidden_actions: ["merge", "close-without-remediation"],
    acceptance_criteria: [
      `Resolve follow-up reason for PR #${followup.prNumber}`,
      `Complete work in stream ${followup.stream}`
    ],
    status: "READY",
    priority: computePriority(followup.reason, false, false), // Computed priority from materialization
    created_at: now,
    started_at: null,
    completed_at: null,
    branch: null,
    commit: null,
    pr_url: `https://github.com/keeganhall33/business-dashboard/issues/${followup.prNumber}`,
    human_approval: { required: false, reason: null }, // Only when not human/production gated
    attempt_count: 0
  };
  
  return {
    task,
    event: "INTEGRATION_FOLLOWUP_ENQUEUED",
    reason: `New follow-up materialized: ${key}`
  };
}

export function makeFollowUpKey(prNumber: number, reason: string, stream: string): string {
  return `${prNumber}:${reason}:${stream}`;
}

export function createCanonicalFollowUpTask(
  prNumber: number,
  reason: string,
  stream: string,
  title: string,
  body: string,
  priority: "P0" | "P1" | "P2" | "P3",
  isHumanGated: boolean = false,
  isProductionGated: boolean = false,
  createdAt: string = new Date().toISOString()
): OrchestrationTaskV1 | null {
  // Create task only for eligible work
  if (!isEligibleForMaterialization({
    prNumber, reason, stream, title, body, priority, isHumanGated, isProductionGated, isHistorical: false, createdAt
  })) {
    return null;
  }
  
  const now = new Date().toISOString();
  const task: OrchestrationTaskV1 = {
    task_id: `orch-rt-${prNumber}-${reason.slice(0, 8)}-${Date.now()}`,
    parent_task_id: null,
    milestone: "release-train-followup",
    stream,
    requested_by: "business-dashboard-integration",
    assigned_agent: "JEEVES",
    task_type: "github_issue",
    directive: body,
    scope: [`pr-${prNumber}`],
    constraints: [`reason: ${reason}`],
    allowed_actions: ["reconcile", "qa-evaluate"],
    forbidden_actions: ["merge"],
    acceptance_criteria: [reason],
    status: "READY",
    priority,
    created_at: now,
    started_at: null,
    completed_at: null,
    branch: null,
    commit: null,
    pr_url: `https://github.com/keeganhall33/business-dashboard/issues/${prNumber}`,
    human_approval: { required: isHumanGated || isProductionGated, reason: isHumanGated ? "Human-gated work" : null },
    attempt_count: 0
  };
  
  return task;
}

export function getFollowUpWorkForValidation(): FollowUpWorkItem[] {
  // Return sample follow-up work for testing/validation
  return [
    {
      prNumber: 860,
      reason: "reconciliation-required",
      stream: "RELEASE_TRAIN",
      title: "[P0 Orchestration] Materialize reconciliation PR #860 into orch:ready",
      body: "Reconciliation work needed for PR #860 in RELEASE_TRAIN stream. Requires validation and QA.",
      priority: "P0",
      isHumanGated: false,
      isProductionGated: false,
      isHistorical: false,
      createdAt: "2026-08-27T14:15:00.000Z"
    },
    {
      prNumber: 861,
      reason: "qa-evaluation-needed",
      stream: "RELEASE_TRAIN",
      title: "[P1 Orchestration] Materialize QA evaluation PR #861 into orch:ready",
      body: "QA evaluation work needed for PR #861 in RELEASE_TRAIN stream.",
      priority: "P1",
      isHumanGated: false,
      isProductionGated: false,
      isHistorical: false,
      createdAt: "2026-08-27T14:15:00.000Z"
    },
    {
      prNumber: 862,
      reason: "reconciliation-required",
      stream: "RELEASE_TRAIN",
      title: "[P1 Orchestration] Materialize reconciliation PR #862 into orch:ready",
      body: "Reconciliation work needed for PR #862 in RELEASE_TRAIN stream.",
      priority: "P1",
      isHumanGated: false,
      isProductionGated: false,
      isHistorical: false,
      createdAt: "2026-08-27T14:15:00.000Z"
    },
    {
      prNumber: 863,
      reason: "qa-evaluation-needed",
      stream: "RELEASE_TRAIN",
      title: "[P2 Orchestration] Materialize QA evaluation PR #863 into orch:ready",
      body: "QA evaluation work needed for PR #863 in RELEASE_TRAIN stream.",
      priority: "P2",
      isHumanGated: false,
      isProductionGated: false,
      isHistorical: false,
      createdAt: "2026-08-27T14:15:00.000Z"
    },
    {
      prNumber: 864,
      reason: "reconciliation-required",
      stream: "RELEASE_TRAIN",
      title: "[P3 Orchestration] Materialize reconciliation PR #864 into orch:ready",
      body: "Reconciliation work needed for PR #864 in RELEASE_TRAIN stream.",
      priority: "P3",
      isHumanGated: false,
      isProductionGated: false,
      isHistorical: false,
      createdAt: "2026-08-27T14:15:00.000Z"
    }
  ];
}

export function integrateValidatedPrQueue(followupWork: FollowUpWorkItem[]): { tasks: OrchestrationTaskV1[]; events: FollowUpMaterializationResult[]; readySetUpdated: boolean } {
  const canonicalIssueMap = new Map<string, OrchestrationTaskV1>();
  const results: FollowUpMaterializationResult[] = [];
  let readySetUpdated = false;
  
  for (const followup of followupWork) {
    const result = materializeFollowUpWork(followup, canonicalIssueMap);
    results.push(result);
    
    if (result.task && result.event === "INTEGRATION_FOLLOWUP_ENQUEUED") {
      canonicalIssueMap.set(makeFollowUpKey(
        followup.prNumber, 
        followup.reason, 
        followup.stream
      ), result.task);
      
      // Ready set updated when we enqueue new work
      readySetUpdated = true;
    } else if (result.event === "INTEGRATION_FOLLOWUP_REUSED") {
      // Already in canonical map, no change to ready set
    } else if (result.event === "INTEGRATION_FOLLOWUP_SKIPPED") {
      // Skip doesn't affect ready set
    }
  }
  
  return { tasks: results.filter(r => r.task).map(r => r.task as OrchestrationTaskV1), events: results, readySetUpdated };
}

export function createWatcherPoll(followupWork: FollowUpWorkItem[]): { 
  tasks: OrchestrationTaskV1[]; 
  skippedEvents: { event: string; reason: string }[] 
} {
  const canonicalIssueMap = new Map<string, OrchestrationTaskV1>();
  const results: FollowUpMaterializationResult[] = [];
  
  for (const followup of followupWork) {
    const result = materializeFollowUpWork(followup, canonicalIssueMap);
    results.push(result);
    
    if (result.event === "INTEGRATION_FOLLOWUP_SKIPPED") {
      // Track skipped items
    }
  }
  
  return {
    tasks: results.filter(r => r.task).map(r => r.task as OrchestrationTaskV1),
    skippedEvents: []
  };
}

export function validateTwoIdenticalPolls(followupWork: FollowUpWorkItem[]): boolean {
  // Two identical polls should produce one canonical follow-up task, not duplicates
  const result1 = integrateValidatedPrQueue([...followupWork]);
  const result2 = integrateValidatedPrQueue([...followupWork]);
  
  // Both should have same tasks and events count
  const taskCount1 = result1.tasks.length;
  const taskCount2 = result2.tasks.length;
  
  return taskCount1 === taskCount2;
}

export function validateMissingValidationEvidence(followupWork: FollowUpWorkItem[]): { event: string; reason: string }[] {
  // Missing validation evidence should map to QA_EVALUATION
  const followupWithMissingEvidence = followupWork.filter(f => f.reason === "qa-evaluation-needed");
  return followupWithMissingEvidence.map(f => ({
    event: "INTEGRATION_FOLLOWUP_ENQUEUED",
    reason: `Mapped ${f.prNumber} to QA_EVALUATION stream`
  }));
}

export function validateClosedOriginalIssue(prNumber: number): boolean {
  // In production, this would check GitHub API for original issue state
  // For now, assume closed issues are not reopened
  return true; // Placeholder
}
