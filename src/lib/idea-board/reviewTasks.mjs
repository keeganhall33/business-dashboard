/**
 * @typedef {Object} IdeaRowLike
 * @property {string} id
 * @property {string} agent_key
 * @property {string} idea_type
 * @property {string} title
 * @property {string|null} summary
 * @property {number|null} expected_impact
 * @property {string} status
 * @property {boolean} requires_ceo_approval
 * @property {string|null} approved_at
 * @property {string|null} linked_task_id
 */

/**
 * Deterministic title so we can safely de-dupe by `findOpenTaskByTitle`.
 * @param {string} ideaTitle
 */
export function buildCeoReviewTaskTitle(ideaTitle) {
  const trimmed = String(ideaTitle ?? "").trim();
  return `CEO Review: ${trimmed || "Untitled idea"}`;
}

/**
 * @param {{id:string, agentKey:string, ideaType:string, title:string, summary:string|null, expectedImpact:number|null}} idea
 */
export function buildCeoReviewTaskDescription(idea) {
  const lines = [
    `Idea ID: ${idea.id}`,
    `Agent: ${idea.agentKey}`,
    `Type: ${idea.ideaType}`,
    "",
    `Title: ${idea.title}`,
    idea.summary ? `Summary: ${idea.summary}` : "Summary: (none)",
    idea.expectedImpact != null ? `Expected impact: ${idea.expectedImpact}` : "Expected impact: (unspecified)",
    "",
    "Decision: approve or reject. If approved, convert into an implementation task + plan."
  ];

  return lines.join("\n");
}

/**
 * We only ensure review tasks for ideas that:
 * - require CEO approval
 * - are not yet approved
 * - are not already linked to a task
 *
 * @param {IdeaRowLike} idea
 */
export function shouldEnsureCeoReviewTask(idea) {
  // Prevent "undead" loops: once an idea is rejected/shipped/archived, it must stay closed.
  // Only ideas in early funnel stages should get a CEO review task.
  const status = String(idea?.status ?? "").toLowerCase();
  const eligibleStatuses = new Set(["proposed", "in_review"]);

  return (
    Boolean(idea?.requires_ceo_approval) &&
    !idea?.approved_at &&
    !idea?.linked_task_id &&
    eligibleStatuses.has(status)
  );
}
