#!/usr/bin/env node
const baseUrl = process.env.PREPARED_ACTIONS_BASE_URL ?? "http://localhost:3000";

async function http(method, path, body) {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch (error) {
    data = { parseError: error?.message, raw: text };
  }
  return { status: res.status, data };
}

async function createTestAction(overrides = {}) {
  const payload = {
    title: "Test Prepared Action",
    category: "website",
    sourcePanel: "pipeline",
    sourceSnapshotAt: new Date().toISOString(),
    sourceUrl: "https://example.com/insight",
    dedupeKey: overrides.dedupeKey ?? `test-${Math.random().toString(36).slice(2, 8)}`,
    whyItMatters: "Traffic spike detected",
    evidence: [{ label: "Metric shift", value: "+12% traffic" }],
    preparedAsset: [{ label: "Draft email", value: "Copy block" }],
    estimatedImpact: "$25k incremental potential",
    riskLevel: "medium",
    confidence: "high",
    dataLight: false,
    requiredApprovalAction: "Manual outreach sequence",
    createdByAgent: "atlas",
    notes: "safety-check",
    ...overrides
  };
  const res = await http("POST", "/api/prepared-actions", payload);
  if (res.status !== 200) {
    throw new Error(`Failed to create test action: ${JSON.stringify(res)}`);
  }
  return res.data.action;
}

function record(bag, key, value) {
  if (!bag[key]) bag[key] = [];
  bag[key].push(value);
}

async function main() {
  const results = {
    validTransitions: [],
    invalidTransitions: [],
    dedupe: [],
    validations: []
  };

  const actionA = await createTestAction({ title: "Action Alpha" });
  let res = await http("PATCH", `/api/prepared-actions/${actionA.id}`, { status: "ready_for_review" });
  record(results, "validTransitions", { step: "draft -> ready_for_review", res });
  res = await http("PATCH", `/api/prepared-actions/${actionA.id}`, { status: "approved", approvalNote: "Looks solid" });
  record(results, "validTransitions", { step: "ready_for_review -> approved", res });
  res = await http("PATCH", `/api/prepared-actions/${actionA.id}`, {
    status: "manually_executed",
    manualExecutionNote: "Completed manually"
  });
  record(results, "validTransitions", { step: "approved -> manually_executed", res });

  const actionB = await createTestAction({ title: "Action Beta" });
  await http("PATCH", `/api/prepared-actions/${actionB.id}`, { status: "ready_for_review" });
  res = await http("PATCH", `/api/prepared-actions/${actionB.id}`, {
    status: "rejected",
    rejectionReason: "Needs better evidence"
  });
  record(results, "validTransitions", { step: "ready_for_review -> rejected", res });

  const actionC = await createTestAction({ title: "Action Gamma" });
  await http("PATCH", `/api/prepared-actions/${actionC.id}`, { status: "ready_for_review" });
  res = await http("PATCH", `/api/prepared-actions/${actionC.id}`, { status: "archived" });
  record(results, "validTransitions", { step: "ready_for_review -> archived", res });

  const actionD = await createTestAction({ title: "Action Delta" });
  res = await http("PATCH", `/api/prepared-actions/${actionD.id}`, { status: "approved" });
  record(results, "invalidTransitions", { step: "draft -> approved", res });

  res = await http("PATCH", `/api/prepared-actions/${actionB.id}`, { status: "approved" });
  record(results, "invalidTransitions", { step: "rejected -> approved", res });

  res = await http("PATCH", `/api/prepared-actions/${actionA.id}`, { status: "approved" });
  record(results, "invalidTransitions", { step: "manually_executed -> approved", res });

  res = await http("PATCH", `/api/prepared-actions/${actionA.id}`, { status: "ready_for_review" });
  record(results, "invalidTransitions", { step: "manually_executed -> ready_for_review", res });

  res = await http("PATCH", `/api/prepared-actions/${actionC.id}`, { status: "ready_for_review" });
  record(results, "invalidTransitions", { step: "archived -> ready_for_review", res });

  const actionE = await createTestAction({ title: "Action Dedupe", dedupeKey: "dedupe-key" });
  record(results, "dedupe", { step: "initial create", actionId: actionE.id });

  const duplicateAttempt = await http("POST", "/api/prepared-actions", {
    title: "Action Dedupe Copy",
    category: "website",
    sourcePanel: "pipeline",
    sourceSnapshotAt: new Date().toISOString(),
    dedupeKey: "dedupe-key",
    whyItMatters: "Duplicate attempt",
    evidence: [{ label: "Metric", value: "value" }],
    preparedAsset: [],
    requiredApprovalAction: "Do something",
    createdByAgent: "atlas"
  });
  record(results, "dedupe", { step: "duplicate active draft blocked", res: duplicateAttempt });

  await http("PATCH", `/api/prepared-actions/${actionE.id}`, { status: "archived" });
  const postArchive = await http("POST", "/api/prepared-actions", {
    title: "Action Dedupe Recreate",
    category: "website",
    sourcePanel: "pipeline",
    sourceSnapshotAt: new Date().toISOString(),
    dedupeKey: "dedupe-key",
    whyItMatters: "Post-archive",
    evidence: [{ label: "Metric", value: "value" }],
    preparedAsset: [],
    requiredApprovalAction: "Do something",
    createdByAgent: "atlas"
  });
  record(results, "dedupe", { step: "post-archive recreate", res: postArchive });

  const noEvidence = await http("POST", "/api/prepared-actions", {
    title: "No evidence",
    category: "website",
    sourcePanel: "pipeline",
    whyItMatters: "Missing evidence",
    evidence: [],
    requiredApprovalAction: "Manual",
    createdByAgent: "atlas"
  });
  record(results, "validations", { step: "POST without evidence", res: noEvidence });

  const invalidCategory = await http("POST", "/api/prepared-actions", {
    title: "Bad category",
    category: "bad",
    sourcePanel: "pipeline",
    whyItMatters: "Invalid",
    evidence: [{ label: "Metric", value: "value" }],
    requiredApprovalAction: "Manual",
    createdByAgent: "atlas"
  });
  record(results, "validations", { step: "POST invalid category", res: invalidCategory });

  const actionF = await createTestAction({ title: "Reject requires reason" });
  await http("PATCH", `/api/prepared-actions/${actionF.id}`, { status: "ready_for_review" });
  const rejectWithoutReason = await http("PATCH", `/api/prepared-actions/${actionF.id}`, { status: "rejected" });
  record(results, "validations", { step: "PATCH rejected missing reason", res: rejectWithoutReason });

  const actionG = await createTestAction({ title: "Manual execute note required" });
  await http("PATCH", `/api/prepared-actions/${actionG.id}`, { status: "ready_for_review" });
  await http("PATCH", `/api/prepared-actions/${actionG.id}`, { status: "approved", approvalNote: "ok" });
  const manualNoNote = await http("PATCH", `/api/prepared-actions/${actionG.id}`, { status: "manually_executed" });
  record(results, "validations", { step: "PATCH manually_executed missing note", res: manualNoNote });

  console.log(JSON.stringify(results, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
