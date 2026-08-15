import { execFileSync, spawnSync } from "node:child_process";
import { ORCHESTRATION_V3 } from "./config.mjs";
import { requireHealthyWorker } from "./preflight.mjs";

function arg(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : null;
}

const issue = Number(arg("--issue"));
const workerId = arg("--worker");
if (!Number.isInteger(issue) || issue <= 0 || !workerId) {
  console.error("Usage: node scripts/orchestration-v3/worker.mjs --issue N --worker local-a");
  process.exit(2);
}

function gh(args) {
  return execFileSync("gh", args, { encoding: "utf8", timeout: 30_000 }).trim();
}

function issueSnapshot() {
  return JSON.parse(gh(["issue", "view", String(issue), "--repo", ORCHESTRATION_V3.repo, "--json", "body,labels,comments"]));
}

function labelsOf(snapshot) {
  return new Set((snapshot.labels ?? []).map((l) => l.name));
}

function editLabels({ remove = [], add = [] }) {
  const args = ["issue", "edit", String(issue), "--repo", ORCHESTRATION_V3.repo];
  for (const label of remove) args.push("--remove-label", label);
  for (const label of add) args.push("--add-label", label);
  if (args.length > 6) gh(args);
}

function latestStatus(snapshot) {
  const comments = snapshot.comments ?? [];
  for (let i = comments.length - 1; i >= 0; i -= 1) {
    const body = String(comments[i]?.body ?? "");
    const match = body.match(/"STATUS"\s*:\s*"([A-Z_]+)"/);
    if (match) return match[1];
  }
  return null;
}

function humanApprovalRequired(body) {
  const match = String(body ?? "").match(/\*\*human_approval_required:\*\*\s*([^\n]+)/i);
  return match ? match[1].trim().toLowerCase() === "true" : false;
}

const preflight = requireHealthyWorker(workerId);
const cfg = ORCHESTRATION_V3.workers[workerId];
const env = {
  ...process.env,
  ORCH_LOCAL_ROUTING_ENABLED: "true",
  ORCH_LOCAL_AGENT_ID: workerId,
  ORCH_LOCAL_MODEL: ORCHESTRATION_V3.model.id,
  ORCH_CLOUD_AGENT_ID: workerId,
  OPENCLAW_MODEL: ORCHESTRATION_V3.model.id,
  OPENCLAW_FALLBACK_MODELS: "",
  OLLAMA_API_KEY: process.env.OLLAMA_API_KEY || "ollama-local"
};

console.log(JSON.stringify({ event: "WORKER_START", issue, workerId, preflight, model: ORCHESTRATION_V3.model.id, cloudFallbackAllowed: false }));
const run = spawnSync(process.execPath, [
  "scripts/orchestration-run-issue-openclaw.mjs",
  "--repo", ORCHESTRATION_V3.repo,
  "--issue", String(issue),
  "--agent", workerId,
  "--timeout", "900"
], {
  cwd: cfg.worktree,
  env,
  stdio: "inherit",
  timeout: 950_000
});

const snapshot = issueSnapshot();
const status = latestStatus(snapshot);
const humanRequired = humanApprovalRequired(snapshot.body);
const current = labelsOf(snapshot);
const remove = [ORCHESTRATION_V3.queue.running, ORCHESTRATION_V3.queue.ready, ORCHESTRATION_V3.queue.awaitingReview, ORCHESTRATION_V3.queue.blocked, ORCHESTRATION_V3.queue.humanApproval].filter((x) => current.has(x));
let add = [];

if (humanRequired || status === "AWAITING_HUMAN_APPROVAL") {
  add = [ORCHESTRATION_V3.queue.humanApproval];
} else if (["PASS", "COMPLETE", "SUCCESS"].includes(status)) {
  add = [];
} else if (status === "AWAITING_REVIEW") {
  add = [ORCHESTRATION_V3.queue.blocked];
} else if (["BLOCKED", "FAILED"].includes(status) || run.status !== 0 || run.error) {
  add = [ORCHESTRATION_V3.queue.blocked];
} else {
  add = [ORCHESTRATION_V3.queue.blocked];
}

editLabels({ remove, add });
console.log(JSON.stringify({ event: "WORKER_END", issue, workerId, status, exitCode: run.status, finalLabels: add }));
if (run.error) throw run.error;
process.exitCode = run.status ?? 1;
