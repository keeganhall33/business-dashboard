import "@/lib/server-only";

import { createHash } from "node:crypto";
import { z } from "zod";

import { getSupabaseServerClient } from "@/lib/supabase/server";

const isoTimestamp = z.string().datetime({ offset: true });
const evidenceRef = z.string().trim().min(1).max(500);

export const manualCrmActivityCaptureSchemaV1 = z.object({
  contactEntityId: z.string().trim().min(1).max(240),
  opportunityId: z.string().uuid().nullable().optional(),
  threadId: z.string().trim().min(1).max(500).nullable().optional(),
  activityType: z.enum(["EMAIL", "CALL", "MEETING", "NOTE", "GIFT", "OTHER"]),
  direction: z.enum(["INBOUND", "OUTBOUND", "SELF"]),
  summary: z.string().trim().min(1).max(2000),
  occurredAt: isoTimestamp,
  evidenceRefs: z.array(evidenceRef).min(1).max(100),
  followUpDueAt: isoTimestamp.nullable().optional()
}).strict().superRefine((value, context) => {
  if (value.followUpDueAt && !value.threadId && !value.opportunityId) {
    context.addIssue({
      code: "custom",
      message: "threadId or opportunityId is required when followUpDueAt is supplied"
    });
  }
});

export type ManualCrmActivityCaptureInputV1 = z.infer<typeof manualCrmActivityCaptureSchemaV1>;

type RpcResult = { data: unknown; error: { message?: string } | null };
export type ManualCrmCaptureRpcV1 = (
  name: string,
  args: Record<string, unknown>
) => PromiseLike<RpcResult>;

function canonicalPayload(input: ManualCrmActivityCaptureInputV1, requestHash: string) {
  const suffix = requestHash.slice(0, 32);
  return {
    contactEntityId: input.contactEntityId,
    opportunityId: input.opportunityId ?? null,
    threadId: input.threadId ?? null,
    activityType: input.activityType,
    direction: input.direction,
    summary: input.summary,
    occurredAt: new Date(input.occurredAt).toISOString(),
    evidenceRefs: [...new Set(input.evidenceRefs)].sort((a, b) => a.localeCompare(b)),
    followUpDueAt: input.followUpDueAt ? new Date(input.followUpDueAt).toISOString() : null,
    activityId: `activity:manual:${suffix}`,
    followUpId: `follow-up:manual:${suffix}`
  };
}

export class ManualCrmCaptureConflictErrorV1 extends Error {}

export async function captureManualCrmActivityV1(input: {
  value: ManualCrmActivityCaptureInputV1;
  idempotencyKey: string;
  rpc?: ManualCrmCaptureRpcV1;
}): Promise<unknown> {
  const idempotencyKey = input.idempotencyKey.trim();
  if (!idempotencyKey || idempotencyKey.length > 240) {
    throw new Error("A valid idempotency key is required");
  }
  const normalized = manualCrmActivityCaptureSchemaV1.parse(input.value);
  const requestHash = createHash("sha256")
    .update(JSON.stringify(normalized))
    .digest("hex");
  const payload = canonicalPayload(normalized, requestHash);
  const rpc = input.rpc ?? ((name, args) => getSupabaseServerClient().rpc(name, args));
  const { data, error } = await rpc("capture_crm_manual_activity_v1", {
    p_idempotency_key: idempotencyKey,
    p_request_hash: requestHash,
    p_payload: payload
  });
  if (error) {
    if (error.message?.includes("CRM_IDEMPOTENCY_CONFLICT")) {
      throw new ManualCrmCaptureConflictErrorV1("Idempotency key was already used for different CRM data");
    }
    throw new Error(error.message || "Manual CRM capture failed");
  }
  return data;
}
