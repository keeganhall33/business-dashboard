import { NextResponse } from "next/server";
import { z } from "zod";

import { assertSchedulerAuth } from "@/lib/scheduler/auth";
import { runBoardroomCollectionLaneV1 } from "@/lib/external-intelligence/orchestration/handlers/boardroom-collection-v1";
import { runHoophallCollectionLaneV1 } from "@/lib/external-intelligence/orchestration/handlers/hoophall-collection-v1";
import { getExternalIntelligenceSupabaseClient } from "@/lib/external-intelligence/persistence/supabase/client";

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
  enable_rpc: string;
  disable_rpc: string;
  run_lane: (input: { now_iso: string }) => Promise<unknown>;
};

const ONE_SHOT_ALLOWLIST: Record<string, OneShotHandler> = {
  "sports_business.boardroom:production": {
    schedule_id: "sports_business.boardroom:production",
    source_id: "sports_business.boardroom",
    enable_rpc: "enable_boardroom_collection_v1",
    disable_rpc: "disable_boardroom_collection_v1",
    run_lane: runBoardroomCollectionLaneV1
  },
  "sports.basketball.hoophall.official:production": {
    schedule_id: "sports.basketball.hoophall.official:production",
    source_id: "sports.basketball.hoophall.official",
    enable_rpc: "enable_hoophall_collection_v1",
    disable_rpc: "disable_hoophall_collection_v1",
    run_lane: runHoophallCollectionLaneV1
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
  const supabase = getExternalIntelligenceSupabaseClient({});

  // Fail-closed: always attempt to restore safe state.
  let enableOut: unknown = null;
  let laneOut: unknown = null;
  let disableOut: unknown = null;

  try {
    const enabled = await supabase.rpc(handler.enable_rpc, {
      in_requested_by: body.requested_by,
      in_environment: "production"
    });
    if (enabled.error) {
      throw new Error(`enable_failed:${enabled.error.message}`);
    }
    enableOut = enabled.data;

    laneOut = await handler.run_lane({ now_iso: nowIso });
  } finally {
    const disabled = await supabase.rpc(handler.disable_rpc, {
      in_requested_by: body.requested_by,
      in_environment: "production"
    });
    // We still return best-effort result even if disable failed; caller must
    // audit state immediately afterwards.
    disableOut = disabled.error ? { error: disabled.error.message } : disabled.data;
  }

  return NextResponse.json({
    ok: true,
    schedule_id: handler.schedule_id,
    source_id: handler.source_id,
    now_iso: nowIso,
    enable: enableOut,
    lane: laneOut,
    disable: disableOut
  });
}

