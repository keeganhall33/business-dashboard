import { z } from "zod";

import {
  V1_PRODUCTION_SMOKE_REQUIRED_STEPS_V1,
  compileV1ProductionSmokeV1,
  type V1ProductionSmokeInputV1,
  type V1ProductionSmokeResultV1
} from "@/lib/release/v1-production-smoke-v1";

const stepIdSchema = z.enum(V1_PRODUCTION_SMOKE_REQUIRED_STEPS_V1);
const stepStateSchema = z.enum(["PASS", "FAIL", "BLOCKED", "UNKNOWN"]);
const actionRequirementSchema = z.enum(["NONE", "KEEGAN", "UNKNOWN"]);

export const V1_PRODUCTION_SMOKE_INPUT_SCHEMA_V1 = z
  .object({
    releaseSha: z.string(),
    generatedAt: z.string(),
    environment: z.literal("PRODUCTION"),
    observations: z
      .array(
        z
          .object({
            stepId: stepIdSchema,
            state: stepStateSchema,
            observedAt: z.string(),
            observedPath: z.string(),
            evidenceRefs: z.array(z.string()).readonly(),
            releaseSha: z.string(),
            actionRequirement: actionRequirementSchema,
            detail: z.string().nullable().optional()
          })
          .strict()
      )
      .readonly()
  })
  .strict();

/**
 * Parses untrusted production-smoke JSON before it can contribute release evidence.
 * Unknown steps, extra truth-like fields, malformed records, or non-production inputs
 * fail closed here rather than being silently ignored by the compiler.
 */
export function parseV1ProductionSmokeInputV1(value: unknown): V1ProductionSmokeInputV1 {
  return V1_PRODUCTION_SMOKE_INPUT_SCHEMA_V1.parse(value);
}

/** Runtime-safe entry point. This validates and compiles evidence only; it performs no live action. */
export function compileRuntimeV1ProductionSmokeV1(value: unknown): V1ProductionSmokeResultV1 {
  return compileV1ProductionSmokeV1(parseV1ProductionSmokeInputV1(value));
}
