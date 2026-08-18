import { NextResponse } from "next/server";
import {
  buildCareerOperatingSystem,
  getCareerAction,
  type CareerFeedbackState,
  type CareerLane,
  type CareerOutcomeRow,
  type CareerResult
} from "@/lib/career/career-operating-system";
import { createOutcomeMemory, getRecentOutcomeMemory } from "@/lib/supabase/queries";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const CAREER_AGENT_KEY = "avery";

export async function GET() {
  try {
    return NextResponse.json(await getSnapshot());
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load career operating system." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const actionId = typeof body.actionId === "string" ? body.actionId : "";
    const state = parseState(body.state);
    const result = parseResult(body.result);
    const note = typeof body.note === "string" ? body.note.trim().slice(0, 4000) : "";
    const action = getCareerAction(actionId);

    if (!action) {
      return NextResponse.json({ error: "Unknown career action." }, { status: 400 });
    }
    if (!state) {
      return NextResponse.json({ error: "Invalid feedback state." }, { status: 400 });
    }

    const recordedAt = new Date();
    const requestedFollowUpAt = typeof body.followUpAt === "string" ? body.followUpAt : null;
    const followUpAt = state === "DONE_WAITING"
      ? normalizeFollowUpAt(requestedFollowUpAt, recordedAt, action.reviewAfterDays || 7)
      : null;
    const normalizedResult: CareerResult = state === "DONE_WAITING" ? "UNKNOWN" : result ?? "NEUTRAL";

    await createOutcomeMemory({
      agentKey: CAREER_AGENT_KEY,
      outcomeType: outcomeTypeForLane(action.lane),
      title: action.title,
      summary: feedbackSummary(state, normalizedResult, note),
      detailMd: note || undefined,
      impactWindow: followUpAt ?? undefined,
      happenedAtIso: recordedAt.toISOString(),
      metadata: {
        source: "career_os_v1",
        schemaVersion: 1,
        actionId: action.id,
        phaseId: action.phaseId,
        lane: action.lane,
        state,
        result: normalizedResult,
        followUpAt,
        userNote: note || null,
        recordedAt: recordedAt.toISOString()
      }
    });

    return NextResponse.json(await getSnapshot());
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to save career feedback." },
      { status: 500 }
    );
  }
}

async function getSnapshot() {
  const rows = await getRecentOutcomeMemory({
    agentKey: CAREER_AGENT_KEY,
    includeExpired: true,
    limit: 500
  });
  return buildCareerOperatingSystem(rows as CareerOutcomeRow[]);
}

function parseState(value: unknown): CareerFeedbackState | null {
  return value === "DONE_WAITING" || value === "DONE_RESULT" || value === "BLOCKED" || value === "SKIPPED"
    ? value
    : null;
}

function parseResult(value: unknown): CareerResult | null {
  return value === "POSITIVE" || value === "NEUTRAL" || value === "NEGATIVE" || value === "UNKNOWN"
    ? value
    : null;
}

function normalizeFollowUpAt(value: string | null, now: Date, days: number) {
  if (value) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }
  const next = new Date(now);
  next.setUTCDate(next.getUTCDate() + Math.max(1, days));
  return next.toISOString();
}

function outcomeTypeForLane(lane: CareerLane): "task" | "decision" | "experiment" | "partnership" | "content" {
  switch (lane) {
    case "RELATIONSHIP":
      return "partnership";
    case "AUDIENCE":
      return "content";
    case "OWNED_FUTURE":
      return "experiment";
    case "CAREER":
      return "decision";
    default:
      return "task";
  }
}

function feedbackSummary(state: CareerFeedbackState, result: CareerResult, note: string) {
  const suffix = note ? ` — ${note}` : "";
  if (state === "DONE_WAITING") return `Executed; outcome is still pending${suffix}`;
  if (state === "BLOCKED") return `Blocked${suffix}`;
  if (state === "SKIPPED") return `Skipped or intentionally deferred${suffix}`;
  if (result === "POSITIVE") return `Completed with a positive result${suffix}`;
  if (result === "NEGATIVE") return `Completed, but the result was negative and strategy should adjust${suffix}`;
  return `Completed; result recorded as neutral/unclear${suffix}`;
}
