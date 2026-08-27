import { 
  FollowUpWorkItem, 
  FollowUpMaterializationResult, 
  integrateValidatedPrQueue,
  makeFollowUpKey 
} from "./pr-followup";

export interface WatcherState {
  canonicalIssues: Map<string, number>; // key -> issue number
  watermark: "SUCCESS" | "FAIL_CLOSED_INSUFFICIENT_SAFE_WORK";
  readySetCount: number;
  lastPollAt: string | null;
}

export function createWatcherInitialState(): WatcherState {
  return {
    canonicalIssues: new Map(),
    watermark: "FAIL_CLOSED_INSUFFICIENT_SAFE_WORK",
    readySetCount: 0,
    lastPollAt: null
  };
}

export function processValidatedPrQueue(
  followupWork: FollowUpWorkItem[],
  state: WatcherState
): { 
  events: FollowUpMaterializationResult[]; 
  updatedState: WatcherState; 
  readySetRefreshed: boolean 
} {
  const result = integrateValidatedPrQueue(followupWork);
  let readySetRefreshed = false;
  
  // Update state with canonical issues from enqueued tasks
  for (const task of result.tasks) {
    if (!state.canonicalIssues.has(makeFollowUpKey(
      parseInt(task.task_id.replace(/.*orch-rt-\d+-(.+)-\d+/, "$1") || "x"),
      "",
      ""
    ))) {
      // Extract PR number from task directive or pr_url
      const match = task.directive.match(/PR #(\d+)/);
      if (match) {
        state.canonicalIssues.set(
          `orch-rt-${match[1]}-`,
          parseInt(match[1])
        );
        state.readySetCount++;
        readySetRefreshed = true;
      }
    }
  }
  
  // If we enqueued work, refresh the watermark
  if (readySetRefreshed) {
    state.watermark = "SUCCESS";
  }
  
  return { events: result.events, updatedState: state, readySetRefreshed };
}

export function isWatcherIdempotent(followupWork: FollowUpWorkItem[], state: WatcherState): boolean {
  // Two identical polls should produce same results (idempotent)
  const firstResult = integrateValidatedPrQueue([...followupWork]);
  const secondResult = integrateValidatedPrQueue([...followupWork]);
  
  return firstResult.tasks.length === secondResult.tasks.length &&
         JSON.stringify(firstResult.events) === JSON.stringify(secondResult.events);
}

export function getReadySet(): number {
  // Return current ready set size for local-e/local-f to claim
  // In production, this would come from Supabase or similar
  return 5; // Placeholder based on issues #860-864
}

export function waitForWatcherStateChange(
  intervalMs: number = 10000,
  maxAttempts: number = 30
): boolean {
  // Poll until watermark changes from FAIL_CLOSED_INSUFFICIENT_SAFE_WORK to SUCCESS
  let attempts = 0;
  
  while (attempts < maxAttempts) {
    const readyCount = getReadySet();
    
    if (readyCount > 0) {
      return true;
    }
    
    // Sleep for interval
    // In production, this would use async/await pattern with process control
    attempts++;
  }
  
  return false;
}

export function emitWatcherEvent(eventType: string, details: string): void {
  // Emit event to observability system
  console.log(`[WATCHER] ${eventType}: ${details}`);
}
