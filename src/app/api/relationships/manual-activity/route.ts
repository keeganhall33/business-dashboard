import { z } from "zod";

import { badRequest, ok, serverError, validationError } from "@/lib/api/responses";
import { enforceDashboardAuth } from "@/lib/auth/dashboard";
import {
  captureManualCrmActivityV1,
  ManualCrmCaptureConflictErrorV1,
  manualCrmActivityCaptureSchemaV1
} from "@/lib/relationships-crm/manual-activity-capture-v1";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const authResponse = enforceDashboardAuth(request);
  if (authResponse) return authResponse;
  const idempotencyKey = request.headers.get("x-idempotency-key")?.trim() ?? "";
  if (!idempotencyKey) return badRequest("Missing x-idempotency-key");

  try {
    const body: unknown = await request.json();
    const value = manualCrmActivityCaptureSchemaV1.parse(body);
    const result = await captureManualCrmActivityV1({ value, idempotencyKey });
    return ok(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return validationError("Invalid manual CRM activity", error.issues);
    }
    if (error instanceof ManualCrmCaptureConflictErrorV1) {
      return Response.json(
        { ok: false, error: { code: "idempotency_conflict", message: error.message } },
        { status: 409 }
      );
    }
    return serverError("Failed to capture manual CRM activity", {
      message: error instanceof Error ? error.message : String(error)
    });
  }
}
