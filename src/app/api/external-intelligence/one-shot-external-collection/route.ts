import { NextResponse } from "next/server";
import { z } from "zod";

import { assertSchedulerAuth } from "@/lib/scheduler/auth";
import { runBoardroomCollectionLaneV1 } from "@/lib/external-intelligence/orchestration/handlers/boardroom-collection-v1";
import { runHoophallCollectionLaneV1 } from "@/lib/external-intelligence/orchestration/handlers/hoophall-collection-v1";

export const runtime = "nodejs";

const BodySchema = z
  .object({
    schedule_id: z.string().min(1),
    dry_run: z.boolean().optional().default(false),
    requested_by: z.string().min(1).max(120).optional().default("unknown")
  })
  .strict();

type OneShotHandler = {
  schedule_id: string;
  source_id: string;
  run_lane_one_shot: (input: { now_iso: string }) => Promise<unknown>;
};

const ONE_SHOT_ALLOWLIST: Record<string, OneShotHandler> = {
  "sports_business.boardroom:production": {
    schedule_id: "sports_business.boardroom:production",
    source_id: "sports_business.boardroom",
    run_lane_one_shot: (input) => runBoardroomCollectionLaneV1({ ...input, mode: "one_shot" })
  },
  "sports.basketball.hoophall.official:production": {
    schedule_id: "sports.basketball.hoophall.official:production",
    source_id: "sports.basketball.hoophall.official",
    run_lane_one_shot: (input) => runHoophallCollectionLaneV1({ ...input, mode: "one_shot" })
  }
};

function badRequest(error: string) {
  return NextResponse.json({ ok: false, error }, { status: 400 });
}

/**
 * One-shot external collection trigger.
 *
 * Purpose: trigger exactly one allowlisted external collection lane without
 * evaluating `scheduled_jobs` or calling the central scheduler tick.
 */
export async function POST(request: Request) {
  try {
    await assertSchedulerAuth(request);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unauthorized";
    return NextResponse.json({ ok: false, error: message }, { status: 401 });
  }

  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await request.json());
  } catch {
    return badRequest("invalid_json");
  }

  const handler = ONE_SHOT_ALLOWLIST[body.schedule_id];
  if (!handler) {
    return badRequest("schedule_not_allowlisted");
  }

  // Non-mutating validation mode.
  if (body.dry_run) {
    return NextResponse.json({
      ok: true,
      dry_run: true,
      schedule_id: handler.schedule_id,
      source_id: handler.source_id
    });
  }

  const nowIso = new Date().toISOString();

  // One-shot execution must not depend on schedule due-ness (next_run_at) and
  // must not permanently mutate schedule state.
  const laneOut = await handler.run_lane_one_shot({ now_iso: nowIso });

  return NextResponse.json({
    ok: true,
    schedule_id: handler.schedule_id,
    source_id: handler.source_id,
    now_iso: nowIso,
    lane: laneOut
  });
}
