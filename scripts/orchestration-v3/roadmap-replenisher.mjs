import { ORCHESTRATION_V3, workerCandidatesForStream } from "./config.mjs";

const PRIORITY_RANK = Object.freeze({ CRITICAL: 0, P0: 1, P1: 2, P2: 3, P3: 4 });
const GATED_LABELS = new Set([
  ORCHESTRATION_V3.queue.blocked,
  ORCHESTRATION_V3.queue.running,
  ORCHESTRATION_V3.queue.awaitingReview,
  ORCHESTRATION_V3.queue.humanApproval
]);

function labelNames(issue) {
  return new Set((issue?.labels ?? []).map((label) => typeof label === "string" ? label : label?.name).filter(Boolean));
}

function field(body, name) {
  const text = String(body ?? "");
  const escaped = String(name).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(`^\\s*\\*\\*${escaped}:\\*\\*\\s*(.+?)\\s*$`, "im"),
    new RegExp(`^\\s*${escaped}:\\s*(.+?)\\s*$`, "im")
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match[1].trim();
  }
  return null;
}

function section(body, names) {
  const text = String(body ?? "");
  for (const name of names) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = text.match(new RegExp(`^\\s*#{1,6}\\s*${escaped}\\s*$([\\s\\S]*?)(?=^\\s*#{1,6}\\s|\\Z)`, "im"));
    if (match?.[1]?.trim()) return match[1].trim();
  }
  return null;
}

function parseIssueRefs(text) {
  return [...String(text ?? "").matchAll(/#(\d+)\b/g)].map((match) => Number(match[1]));
}

function dependencyDeclaration(body) {
  const values = [field(body, "depends_on"), field(body, "dependency"), field(body, "dependencies")].filter(Boolean);
  const prose = String(body ?? "").match(/^\s*(?:[-*]\s*)?Depends\s+on\s+(.+)$/im)?.[1]?.trim() ?? null;
  if (prose) values.push(prose);
  if (values.length === 0) return { declared: false, ambiguous: false, issue_numbers: [] };
  const joined = values.join(" ");
  const issueNumbers = [...new Set(parseIssueRefs(joined))];
  return { declared: true, ambiguous: issueNumbers.length === 0, issue_numbers: issueNumbers };
}

function ownershipDeclaration(body) {
  const direct = [field(body, "file_ownership"), field(body, "file ownership"), field(body, "collision_guard"), field(body, "collision guard")].find(Boolean);
  const value = direct ?? section(body, ["File ownership / collision guard", "File ownership", "Collision guard", "Scope / ownership"]);
  if (!value) return null;
  const normalized = value.toLowerCase().replace(/\s+/g, " ").trim();
  return normalized.length >= 12 ? normalized : null;
}

function ownershipOverlaps(left, right) {
  if (!left || !right) return true;
  return left === right || left.includes(right) || right.includes(left);
}

function normalizeCandidate(issue) {
  const body = String(issue?.body ?? "");
  const stream = String(field(body, "stream") ?? "").trim().toUpperCase();
  const priority = String(field(body, "priority") ?? "P2").trim().toUpperCase();
  const approval = String(field(body, "human_approval_required") ?? "").trim().toLowerCase();
  return {
    issue,
    number: Number(issue?.number),
    stream,
    priority,
    priority_rank: PRIORITY_RANK[priority] ?? PRIORITY_RANK.P2,
    worker_candidates: workerCandidatesForStream(stream),
    labels: labelNames(issue),
    approval,
    dependencies: dependencyDeclaration(body),
    ownership: ownershipDeclaration(body)
  };
}

export function evaluateRoadmapCandidate(issue, {
  uncoveredWorkerIds = [],
  dependencyStates = new Map(),
  occupiedIssues = []
} = {}) {
  const candidate = normalizeCandidate(issue);
  const reasons = [];
  const uncovered = new Set(uncoveredWorkerIds);

  if (!Number.isInteger(candidate.number) || candidate.number <= 0) reasons.push("INVALID_ISSUE_NUMBER");
  if (!candidate.labels.has(ORCHESTRATION_V3.queue.base)) reasons.push("MISSING_BASE_LABEL");
  for (const label of GATED_LABELS) if (candidate.labels.has(label)) reasons.push(`GATED_${label.toUpperCase().replace(/[: -]/g, "_")}`);
  if (candidate.labels.has(ORCHESTRATION_V3.queue.ready)) reasons.push("ALREADY_READY");
  if (candidate.approval !== "false") reasons.push("HUMAN_APPROVAL_NOT_EXPLICITLY_FALSE");
  if (candidate.worker_candidates.length === 0) reasons.push("UNMAPPED_STREAM");
  if (!candidate.worker_candidates.some((workerId) => uncovered.has(workerId))) reasons.push("NO_UNCOVERED_WORKER_MATCH");
  if (candidate.dependencies.ambiguous) reasons.push("AMBIGUOUS_DEPENDENCY_DECLARATION");

  for (const dependency of candidate.dependencies.issue_numbers) {
    if (String(dependencyStates.get(dependency) ?? "").toLowerCase() !== "closed") {
      reasons.push(`DEPENDENCY_NOT_CLOSED:#${dependency}`);
    }
  }

  if (!candidate.ownership) reasons.push("MISSING_EXPLICIT_FILE_OWNERSHIP");
  if (candidate.ownership) {
    for (const occupied of occupiedIssues.map(normalizeCandidate)) {
      if (!occupied.ownership) {
        reasons.push(`OCCUPIED_OWNERSHIP_UNKNOWN:#${occupied.number}`);
        continue;
      }
      if (ownershipOverlaps(candidate.ownership, occupied.ownership)) {
        reasons.push(`FILE_OWNERSHIP_COLLISION:#${occupied.number}`);
      }
    }
  }

  return {
    eligible: reasons.length === 0,
    reasons,
    issue_number: candidate.number,
    stream: candidate.stream,
    priority: candidate.priority,
    priority_rank: candidate.priority_rank,
    worker_candidates: candidate.worker_candidates,
    ownership: candidate.ownership,
    dependency_issue_numbers: candidate.dependencies.issue_numbers
  };
}

export function planRoadmapReplenishment({
  openIssues = [],
  uncoveredWorkerIds = [],
  dependencyStates = new Map(),
  occupiedIssues = []
} = {}) {
  const productUncovered = uncoveredWorkerIds.filter((workerId) => ORCHESTRATION_V3.capacity.productWorkers.includes(workerId));
  const evaluations = openIssues.map((issue) => ({
    issue,
    evaluation: evaluateRoadmapCandidate(issue, {
      uncoveredWorkerIds: productUncovered,
      dependencyStates,
      occupiedIssues
    })
  }));

  const eligible = evaluations
    .filter((entry) => entry.evaluation.eligible)
    .sort((left, right) =>
      left.evaluation.priority_rank - right.evaluation.priority_rank ||
      left.evaluation.issue_number - right.evaluation.issue_number
    );

  const selected = [];
  const selectedWorkers = new Set();
  const selectedIssues = [];

  for (const entry of eligible) {
    const workerId = entry.evaluation.worker_candidates.find((id) => productUncovered.includes(id) && !selectedWorkers.has(id));
    if (!workerId) continue;

    const collision = selectedIssues.some((other) => ownershipOverlaps(entry.evaluation.ownership, other.evaluation.ownership));
    if (collision) continue;

    selectedWorkers.add(workerId);
    selectedIssues.push(entry);
    selected.push({ worker_id: workerId, issue_number: entry.evaluation.issue_number, stream: entry.evaluation.stream });
  }

  return {
    requested_worker_ids: productUncovered,
    selected,
    still_uncovered_worker_ids: productUncovered.filter((workerId) => !selectedWorkers.has(workerId)),
    rejected: evaluations
      .filter((entry) => !entry.evaluation.eligible)
      .map((entry) => ({ issue_number: entry.evaluation.issue_number, reasons: entry.evaluation.reasons }))
  };
}
