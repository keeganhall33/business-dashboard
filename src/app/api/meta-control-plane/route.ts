import { badRequest, ok, serverError } from "@/lib/api/responses";
import { enforceDashboardAuth } from "@/lib/auth/dashboard";
import { getSupabaseServerClient } from "@/lib/supabase/server";
// The governed runtime lives under scripts so the same pure service is usable by
// deterministic tests and server routes without a browser bundle.
import { createMetaMarketingClient, createReviewModeService, MetaControlPlaneError } from "../../../../scripts/meta-control-plane/review-mode-v1.mjs";

export const runtime = "nodejs";

type Row = Record<string, unknown> & { id: string };

function createRepository() {
  const supabase = getSupabaseServerClient();
  const table = () => supabase.from("meta_change_proposals");
  return {
    async list(state?: string | null) {
      let query = table().select("*").order("created_at", { ascending: false }).limit(100);
      if (state) query = query.eq("approval_state", state);
      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
    async get(id: string) {
      const { data, error } = await table().select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      return data as Row | null;
    },
    async findByIdempotencyKey(key: string) {
      const { data, error } = await table().select("*").eq("idempotency_key", key).maybeSingle();
      if (error) throw error;
      return data as Row | null;
    },
    async create(values: Record<string, unknown>) {
      const { data, error } = await table().insert(values).select("*").single();
      if (error) throw error;
      return data as Row;
    },
    async update(id: string, values: Record<string, unknown>) {
      const { data, error } = await table().update(values).eq("id", id).select("*").single();
      if (error) throw error;
      return data as Row;
    }
  };
}

function service() {
  return createReviewModeService({
    repository: createRepository(),
    metaClient: createMetaMarketingClient({ accessToken: process.env.META_ACCESS_TOKEN ?? "" })
  });
}

function errorResponse(error: unknown) {
  if (error instanceof MetaControlPlaneError) {
    const controlled = error as Error & { code: string; details: unknown };
    return badRequest(controlled.message, { code: controlled.code, details: controlled.details });
  }
  return serverError("Meta control-plane request failed", { message: error instanceof Error ? error.message : String(error) });
}

export async function GET(request: Request) {
  const auth = enforceDashboardAuth(request);
  if (auth) return auth;
  try {
    const state = new URL(request.url).searchParams.get("state");
    return ok({ ok: true, mode: "REVIEW", autopilot: false, proposals: await service().list(state) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  const auth = enforceDashboardAuth(request);
  if (auth) return auth;
  try {
    const body = await request.json() as Record<string, unknown>;
    const action = String(body.action ?? "");
    const review = service();
    if (action === "observe") {
      const idempotencyKey = request.headers.get("x-idempotency-key")?.trim();
      if (!idempotencyKey) return badRequest("Missing x-idempotency-key");
      const proposal = await review.observe({
        objectType: body.objectType,
        objectId: String(body.objectId ?? ""),
        proposedState: body.proposedState,
        rationale: String(body.rationale ?? ""),
        supportingMetrics: body.supportingMetrics,
        confidence: String(body.confidence ?? "unknown"),
        riskTier: String(body.riskTier ?? "medium"),
        proposer: String(body.proposer ?? "dashboard"),
        idempotencyKey
      });
      return ok({ ok: true, proposal });
    }
    const id = String(body.id ?? "");
    if (!id) return badRequest("Missing proposal id");
    if (action === "approve") return ok({ ok: true, proposal: await review.approve(id, String(body.actor ?? "")) });
    if (action === "reject") return ok({ ok: true, proposal: await review.reject(id, String(body.actor ?? ""), String(body.reason ?? "")) });
    if (action === "execute") return ok({ ok: true, proposal: await review.execute(id, { dryRun: body.dryRun !== false, confirmLiveWrite: body.confirmLiveWrite === true }) });
    if (action === "rollback") return ok({ ok: true, proposal: await review.rollback(id, { dryRun: body.dryRun !== false, confirmLiveWrite: body.confirmLiveWrite === true }) });
    return badRequest("Unsupported action");
  } catch (error) {
    return errorResponse(error);
  }
}
