import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/scheduler/auth", () => ({
  assertSchedulerAuth: vi.fn(async () => undefined)
}));

vi.mock("@/lib/external-intelligence/persistence/supabase/client", () => ({
  getExternalIntelligenceSupabaseClient: vi.fn(() => ({
    rpc: vi.fn(async () => ({ data: [{ schedule_id: "x", enabled: true }], error: null }))
  }))
}));

vi.mock("@/lib/external-intelligence/orchestration/handlers/boardroom-collection-v1", () => ({
  runBoardroomCollectionLaneV1: vi.fn(async () => ({
    status: "succeeded",
    wrote: { evidence: 1, claims: 1 },
    selection: { mode: "unfiltered", skipped_items: 0, selected_items: 1, filter: null },
    observability_v1: {
      collection: { fetched_items: 5, selected_items: 1, skipped_items: 4 },
      evidence: { processed: 1, new_versions: 0, idempotent_replays: 1, errors: 0 },
      qualification: {
        processed: 1,
        qualified: 1,
        not_qualified: 0,
        unsupported: 0,
        errors: 0,
        reason_codes: {}
      },
      claims: { proposed: 1, persistence_attempts: 1, new_versions: 0, idempotent_replays: 1, errors: 0 },
      sports_milestones: { proposed: 0, persistence_attempts: 0, persisted: 0, errors: 0 }
    }
  }))
}));

vi.mock("@/lib/external-intelligence/orchestration/handlers/hoophall-collection-v1", () => ({
  runHoophallCollectionLaneV1: vi.fn(async () => ({ status: "succeeded" }))
}));

import { assertSchedulerAuth } from "@/lib/scheduler/auth";
import { getExternalIntelligenceSupabaseClient } from "@/lib/external-intelligence/persistence/supabase/client";
import { runBoardroomCollectionLaneV1 } from "@/lib/external-intelligence/orchestration/handlers/boardroom-collection-v1";
import { POST } from "@/app/api/external-intelligence/one-shot-external-collection/route";

type MockFn<TArgs extends unknown[] = unknown[], TResult = unknown> = {
  mock: { calls: TArgs[] };
} & ((...args: TArgs) => TResult);

function makeRequest(body: unknown) {
  return new Request("https://example.test/api/external-intelligence/one-shot-external-collection", {
    method: "POST",
    headers: { "content-type": "application/json", "x-scheduler-secret": "x" },
    body: JSON.stringify(body)
  });
}

describe("one-shot external collection route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("requires schedule allowlist", async () => {
    const res = await POST(makeRequest({ schedule_id: "nope" }));
    expect(res.status).toBe(400);
  });

  it("supports dry-run without mutating", async () => {
    const res = await POST(makeRequest({ schedule_id: "sports_business.boardroom:production", dry_run: true }));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean; dry_run?: boolean };
    expect(json.ok).toBe(true);
    expect(json.dry_run).toBe(true);

    const sb = getExternalIntelligenceSupabaseClient as unknown as MockFn;
    expect(sb.mock.calls.length).toBe(0);
    const lane = runBoardroomCollectionLaneV1 as unknown as MockFn;
    expect(lane.mock.calls.length).toBe(0);
  });

  it("enables, runs lane, and disables", async () => {
    const res = await POST(makeRequest({ schedule_id: "sports_business.boardroom:production", requested_by: "test" }));
    expect(res.status).toBe(200);
    const auth = assertSchedulerAuth as unknown as MockFn;
    expect(auth.mock.calls.length).toBe(1);

    // Lane invoked once with one-shot mode.
    const lane = runBoardroomCollectionLaneV1 as unknown as MockFn;
    expect(lane.mock.calls.length).toBe(1);
    expect(lane.mock.calls[0]?.[0]).toMatchObject({ mode: "one_shot" });

    const json = (await res.json()) as unknown as { ok: boolean; lane?: { observability_v1?: { evidence?: { idempotent_replays?: number } } } };
    expect(json.ok).toBe(true);
    expect(json.lane?.observability_v1?.evidence?.idempotent_replays).toBe(1);
  });
});
