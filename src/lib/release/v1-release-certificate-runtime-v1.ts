import { z } from "zod";

import {
  V1_RELEASE_REQUIRED_GATES_V1,
  compileV1ReleaseCertificateV1,
  type V1ReleaseCertificateV1,
  type V1ReleaseCertificationInputV1
} from "@/lib/release/v1-release-certificate-v1";

const gateStateSchema = z.enum(["PASS", "FAIL", "BLOCKED", "UNKNOWN", "CONFLICTED"]);
const freshnessSchema = z.enum(["CURRENT", "STALE", "UNKNOWN"]);
const actionRequirementSchema = z.enum(["NONE", "KEEGAN", "UNKNOWN"]);
const finalAcceptanceStateSchema = z.enum(["PENDING", "ACCEPTED", "REJECTED", "UNKNOWN"]);
const gateIdSchema = z.enum(V1_RELEASE_REQUIRED_GATES_V1);

const evidenceRefsSchema = z.array(z.string()).readonly();

export const V1_RELEASE_CERTIFICATION_INPUT_SCHEMA_V1 = z
  .object({
    releaseSha: z.string(),
    generatedAt: z.string(),
    gates: z
      .array(
        z
          .object({
            gateId: gateIdSchema,
            state: gateStateSchema,
            freshness: freshnessSchema,
            observedAt: z.string(),
            evidenceRefs: evidenceRefsSchema,
            releaseSha: z.string().nullable(),
            actionRequirement: actionRequirementSchema,
            detail: z.string().nullable().optional()
          })
          .strict()
      )
      .readonly(),
    finalAcceptance: z
      .object({
        state: finalAcceptanceStateSchema,
        releaseSha: z.string().nullable().optional(),
        observedAt: z.string().nullable().optional(),
        evidenceRefs: evidenceRefsSchema.optional()
      })
      .strict()
  })
  .strict();

/**
 * Parses untrusted JSON release evidence before it reaches the certificate compiler.
 *
 * Runtime callers must not rely on TypeScript casts for release truth. Unknown gate
 * identifiers, malformed evidence records, or extra fields fail closed here rather
 * than being silently ignored by the compiler.
 */
export function parseV1ReleaseCertificationInputV1(value: unknown): V1ReleaseCertificationInputV1 {
  return V1_RELEASE_CERTIFICATION_INPUT_SCHEMA_V1.parse(value);
}

/**
 * Runtime-safe entry point for producing a V1 certificate from external JSON.
 * This performs validation only; it does not collect evidence, deploy, mutate
 * production, send email, or grant approval authority.
 */
export function compileRuntimeV1ReleaseCertificateV1(value: unknown): V1ReleaseCertificateV1 {
  return compileV1ReleaseCertificateV1(parseV1ReleaseCertificationInputV1(value));
}
