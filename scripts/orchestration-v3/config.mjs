import os from "node:os";
import path from "node:path";

const OPENCLAW_ROOT = path.join(os.homedir(), ".openclaw");

export const ORCHESTRATION_V3 = Object.freeze({
  version: 3,
  repo: "keeganhall33/business-dashboard",
  queue: Object.freeze({
    ready: "orch:ready",
    running: "orch:running",
    awaitingReview: "orch:awaiting_review",
    blocked: "orch:blocked",
    humanApproval: "orch:awaiting_human_approval",
    base: "agent-orchestration"
  }),
  runtime: Object.freeze({
    root: path.join(OPENCLAW_ROOT, "runtime-v3", "business-dashboard"),
    stateRoot: path.join(OPENCLAW_ROOT, "state", "orchestration-v3"),
    backupRoot: path.join(OPENCLAW_ROOT, "orchestration-v3-backups"),
    logRoot: path.join(os.homedir(), "Library", "Logs"),
    canonicalRef: "origin/main"
  }),
  model: Object.freeze({
    provider: "ollama",
    id: "ollama/qwen3.5:9b",
    cloudFallbackAllowed: false
  }),
  workers: Object.freeze({
    "local-a": Object.freeze({ stream: "CORE_INTELLIGENCE", aliases: ["LEARNING_INTELLIGENCE", "FINANCIAL_INTELLIGENCE"], worktree: path.join(OPENCLAW_ROOT, "worktrees", "local-a"), agentWorkspace: path.join(OPENCLAW_ROOT, "agent-workspaces-v3", "local-a") }),
    "local-b": Object.freeze({ stream: "DISCOVERY_INTELLIGENCE", worktree: path.join(OPENCLAW_ROOT, "worktrees", "local-b"), agentWorkspace: path.join(OPENCLAW_ROOT, "agent-workspaces-v3", "local-b") }),
    "local-c": Object.freeze({ stream: "INTELLIGENCE_UX", aliases: ["PRODUCTION_VALUE"], worktree: path.join(OPENCLAW_ROOT, "worktrees", "local-c"), agentWorkspace: path.join(OPENCLAW_ROOT, "agent-workspaces-v3", "local-c") }),
    "local-d": Object.freeze({ stream: "AGENT_ORCHESTRATION", aliases: ["ORCHESTRATION_SYSTEMS"], worktree: path.join(OPENCLAW_ROOT, "worktrees", "local-d"), agentWorkspace: path.join(OPENCLAW_ROOT, "agent-workspaces-v3", "local-d") })
  })
});

export function workerForStream(stream) {
  const normalized = String(stream ?? "").trim().toUpperCase();
  for (const [workerId, cfg] of Object.entries(ORCHESTRATION_V3.workers)) {
    if (normalized === cfg.stream || (cfg.aliases ?? []).includes(normalized)) return workerId;
  }
  return null;
}
