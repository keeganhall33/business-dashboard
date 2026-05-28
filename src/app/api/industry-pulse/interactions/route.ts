import { ok, serverError, validationError } from "@/lib/api/responses";
import { parseJsonBody } from "@/lib/validation/parse";
import { industryPulsePatchSchema } from "@/lib/validation/industryPulse";
import { getSystemState, upsertSystemState } from "@/lib/supabase/queries";

export const runtime = "nodejs";

type Stored = {
  updatedAtIso: string;
  items: Record<
    string,
    {
      contactedAtIso?: string;
      addedToPipelineAtIso?: string;
      pipelineOpportunityId?: string;
      dismissedAtIso?: string;
    }
  >;
};

function normalizeStored(valueJson: unknown): Stored {
  if (!valueJson || typeof valueJson !== "object") {
    return { updatedAtIso: new Date().toISOString(), items: {} };
  }
  const payload = valueJson as Partial<Stored>;
  return {
    updatedAtIso: typeof payload.updatedAtIso === "string" ? payload.updatedAtIso : new Date().toISOString(),
    items: payload.items && typeof payload.items === "object" ? (payload.items as Stored["items"]) : {}
  };
}

export async function GET() {
  try {
    const state = await getSystemState("industry_pulse_interactions");
    const stored = normalizeStored(state?.value_json);
    return ok({ ok: true, updatedAtIso: stored.updatedAtIso, items: stored.items });
  } catch (error) {
    return serverError("Failed to fetch industry pulse interactions", {
      message: error instanceof Error ? error.message : String(error)
    });
  }
}

export async function PATCH(request: Request) {
  try {
    const parsed = await parseJsonBody(request, industryPulsePatchSchema);
    if (!parsed.success) return validationError(parsed.error.message, parsed.error.issues);

    const state = await getSystemState("industry_pulse_interactions");
    const stored = normalizeStored(state?.value_json);

    const next = { ...stored.items[parsed.data.id] };
    const now = new Date().toISOString();

    if (parsed.data.contacted === true) {
      next.contactedAtIso = next.contactedAtIso ?? now;
    }

    if (parsed.data.addedToPipeline) {
      next.addedToPipelineAtIso = next.addedToPipelineAtIso ?? now;
      if (parsed.data.addedToPipeline.opportunityId) {
        next.pipelineOpportunityId = parsed.data.addedToPipeline.opportunityId;
      }
    }

    if (parsed.data.dismissed === true) {
      next.dismissedAtIso = next.dismissedAtIso ?? now;
    }

    const updated: Stored = {
      updatedAtIso: now,
      items: {
        ...stored.items,
        [parsed.data.id]: next
      }
    };

    await upsertSystemState("industry_pulse_interactions", updated);
    return ok({ ok: true, updatedAtIso: updated.updatedAtIso, items: updated.items });
  } catch (error) {
    return serverError("Failed to update industry pulse interactions", {
      message: error instanceof Error ? error.message : String(error)
    });
  }
}
