import { NextResponse } from "next/server";
import { runDeliverableHarvest } from "@/lib/scheduler/deliverableHarvest";
import { runProofEnforcementChecks } from "@/lib/scheduler/proofEnforcement";
import { runCeoDigest } from "@/lib/scheduler/ceoDigest";
import { runWeeklySummary } from "@/lib/scheduler/weeklySummary";

export const runtime = "nodejs";

const JOB_RUNNERS = {
  "deliverable-harvest": runDeliverableHarvest,
  "proof-enforcement": runProofEnforcementChecks,
  "ceo-digest": runCeoDigest,
  "weekly-summary": runWeeklySummary
} as const;

type JobKey = keyof typeof JOB_RUNNERS;

type RunJobRequest = {
  jobKey?: string;
};

function isJobKey(value: string): value is JobKey {
  return value in JOB_RUNNERS;
}

export async function POST(request: Request) {
  let body: RunJobRequest = {};
  try {
    body = (await request.json()) as RunJobRequest;
  } catch {
    // Swallow JSON parse errors so we can return a friendly response below.
  }

  const jobKey = typeof body.jobKey === "string" ? body.jobKey : null;
  if (!jobKey || !isJobKey(jobKey)) {
    return NextResponse.json({ ok: false, error: "Unknown automation job." }, { status: 400 });
  }

  const runner = JOB_RUNNERS[jobKey];
  try {
    const result = await runner();
    return NextResponse.json({ ok: true, jobKey, result });
  } catch (error) {
    console.error("Failed to run automation job", { jobKey, error });
    const message = error instanceof Error ? error.message : "Failed to run automation job.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
