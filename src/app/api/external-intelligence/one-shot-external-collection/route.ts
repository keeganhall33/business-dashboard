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
    requested_by: z.string().min(1).max(120).optional().default("unknown"),

    // One-shot only: optional narrow filter for Boardroom controlled proofs.
    boardroom: z
      .object({
        // Safety: keep the maximum explicitly-selected persistence targets <= 5.
        // We reject oversized filters rather than silently truncating.
        evidence_reference_ids: z.array(z.string().min(1)).min(1).max(5).optional(),
        canonical_urls: z.array(z.string().url()).min(1).max(5).optional()
      })
      .strict()
      .optional()
  })
  .strict()
  .superRefine((val, ctx) => {
    // Fail closed: an explicitly supplied boardroom filter must contain at least one selector.
    if (val.boardroom) {
      const hasIds = (val.boardroom.evidence_reference_ids ?? []).length > 0;
      const hasUrls = (val.boardroom.canonical_urls ?? []).length > 0;
      if (!hasIds && !hasUrls) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["boardroom"], message: "empty_boardroom_filter" });
      }
    }
  });

type OneShotHandler = {
  schedule_id: string;
  source_id: string;
  run_lane_one_shot: (input: {
    now_iso: string;
    one_shot_filter: null | { evidence_reference_ids?: string[]; canonical_urls?: string[] };
  }) => Promise<unknown>;
};

const ONE_SHOT_ALLOWLIST: Record<string, OneShotHandler> = {
  "sports_business.boardroom:production": {
    schedule_id: "sports_business.boardroom:production",
    source_id: "sports_business.boardroom",
    run_lane_one_shot: (input) =>
      runBoardroomCollectionLaneV1({
        ...input,
        mode: "one_shot",
        one_shot_filter: input.one_shot_filter
      })
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

export function __test__parseOneShotBody(input: unknown) {
  const body = BodySchema.parse(input);

  // Boardroom filter is allowlisted for boardroom schedule only.
  const boardroomScheduleId = "sports_business.boardroom:production" as const;
  if (body.boardroom && body.schedule_id !== boardroomScheduleId) {
    throw new Error("boardroom_filter_not_allowed_for_schedule");
  }

  const one_shot_filter = body.boardroom
    ? {
        evidence_reference_ids: body.boardroom.evidence_reference_ids,
        canonical_urls: body.boardroom.canonical_urls
      }
    : null;

  return { body, one_shot_filter };
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

  let one_shot_filter: null | { evidence_reference_ids?: string[]; canonical_urls?: string[] };
  try {
    one_shot_filter = __test__parseOneShotBody(body).one_shot_filter;
  } catch (e) {
    return badRequest(e instanceof Error ? e.message : "invalid_json");
  }

  // Non-mutating validation mode.
  if (body.dry_run) {
    return NextResponse.json({
      ok: true,
      dry_run: true,
      schedule_id: handler.schedule_id,
      source_id: handler.source_id,
      one_shot_filter
    });
  }

  const nowIso = new Date().toISOString();

  // One-shot execution must not depend on schedule due-ness (next_run_at) and
  // must not permanently mutate schedule state.
  const laneOut = await handler.run_lane_one_shot({ now_iso: nowIso, one_shot_filter });

  return NextResponse.json({
    ok: true,
    schedule_id: handler.schedule_id,
    source_id: handler.source_id,
    now_iso: nowIso,
    lane: laneOut
  });
}
