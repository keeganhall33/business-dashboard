import { z } from "zod";

import {
  V1_RELEASE_REQUIRED_GATES_V1,
  compileV1ReleaseCertificateV1,
  type V1ReleaseCertificateV1,
  type V1ReleaseCertificationInputV1,
  type V1ReleaseGateIdV1
} from "@/lib/release/v1-release-certificate-v1";

const gateStateSchema = z.enum(["PASS", "FAIL", "BLOCKED", "UNKNOWN", "CONFLICTED"]);
const freshnessSchema = z.enum(["CURRENT", "STALE", "UNKNOWN"]);
const actionRequirementSchema = z.enum(["NONE", "KEEGAN", "UNKNOWN"]);
const finalAcceptanceStateSchema = z.enum(["PENDING", "ACCEPTED", "REJECTED", "UNKNOWN"]);
const gateIdSchema = z.enum(V1_RELEASE_REQUIRED_GATES_V1);

const evidenceRefsSchema = z.array(z.string()).readonly();

/**
 * Live/runtime release evidence must be re-observed close to certification time.
 * Static exact-SHA gates (integrated code, review audit, and P0 code/security review)
 * remain replay-safe for the same immutable release SHA, while production/data gates
 * are demoted to STALE after one hour even if an external input labels them CURRENT.
 */
export const V1_RELEASE_LIVE_GATE_MAX_AGE_MS_V1 = 60 * 60 * 1_000;

const V1_RELEASE_LIVE_GATES_V1 = new Set<V1ReleaseGateIdV1>([
  "PRODUCTION_PROPAGATION",
  "PRODUCTION_SMOKE",
  "EXECUTIVE_HOME_TRUTH",
  "CRM_DIRECTORY_READS",
  "IONOS_THREE_MAILBOX_PROOF"
]);

const V1_RELEASE_POST_PROPAGATION_GATES_V1 = new Set<V1ReleaseGateIdV1>([
  "PRODUCTION_SMOKE",
  "EXECUTIVE_HOME_TRUTH",
  "CRM_DIRECTORY_READS"
]);

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

function enforceLiveGateFreshnessV1(
  input: V1ReleaseCertificationInputV1
): V1ReleaseCertificationInputV1 {
  const runtimeNowMs = Date.now();
  let changed = false;
  const gates = input.gates.map((gate) => {
    if (!V1_RELEASE_LIVE_GATES_V1.has(gate.gateId) || gate.freshness !== "CURRENT") {
      return gate;
    }

    const observedAtMs = Date.parse(gate.observedAt);
    if (!Number.isFinite(observedAtMs)) return gate;

    if (observedAtMs > runtimeNowMs) {
      changed = true;
      return {
        ...gate,
        freshness: "UNKNOWN" as const,
        detail:
          gate.detail ??
          `${gate.gateId} live evidence is future-dated relative to the runtime certification clock.`
      };
    }

    if (runtimeNowMs - observedAtMs <= V1_RELEASE_LIVE_GATE_MAX_AGE_MS_V1) {
      return gate;
    }

    changed = true;
    return {
      ...gate,
      freshness: "STALE" as const,
      detail:
        gate.detail ??
        `${gate.gateId} live evidence is older than the one-hour runtime release-certification window.`
    };
  });

  return changed ? { ...input, gates } : input;
}

function enforcePostPropagationChronologyV1(
  input: V1ReleaseCertificationInputV1
): V1ReleaseCertificationInputV1 {
  const propagationMatches = input.gates.filter(
    (gate) => gate.gateId === "PRODUCTION_PROPAGATION"
  );
  if (propagationMatches.length !== 1) return input;

  const propagation = propagationMatches[0];
  const propagationAtMs = Date.parse(propagation.observedAt);
  const propagationIsDecisionGrade =
    propagation.state === "PASS" &&
    propagation.freshness === "CURRENT" &&
    propagation.releaseSha === input.releaseSha &&
    propagation.actionRequirement === "NONE" &&
    Number.isFinite(propagationAtMs);
  if (!propagationIsDecisionGrade) return input;

  let changed = false;
  const gates = input.gates.map((gate) => {
    if (
      !V1_RELEASE_POST_PROPAGATION_GATES_V1.has(gate.gateId) ||
      gate.state !== "PASS" ||
      gate.freshness !== "CURRENT" ||
      gate.releaseSha !== input.releaseSha
    ) {
      return gate;
    }

    const gateAtMs = Date.parse(gate.observedAt);
    if (!Number.isFinite(gateAtMs) || gateAtMs >= propagationAtMs) return gate;

    changed = true;
    return {
      ...gate,
      freshness: "UNKNOWN" as const,
      detail:
        gate.detail ??
        `${gate.gateId} live evidence predates exact-SHA production propagation and must be re-observed after deployment.`
    };
  });

  return changed ? { ...input, gates } : input;
}

/**
 * Runtime-safe entry point for producing a V1 certificate from external JSON.
 * This performs validation and fail-closed live-evidence freshness enforcement only;
 * it does not collect evidence, deploy, mutate production, send email, or grant
 * approval authority.
 *
 * Live evidence age is evaluated against the actual runtime wall clock, never the
 * caller-supplied generatedAt value or an overrideable caller clock. Production smoke,
 * Executive Home truth, and CRM live-read evidence must also be observed no earlier
 * than the exact-SHA production-propagation proof so preview/pre-deploy evidence cannot
 * satisfy a production release gate.
 */
export function compileRuntimeV1ReleaseCertificateV1(value: unknown): V1ReleaseCertificateV1 {
  const parsed = parseV1ReleaseCertificationInputV1(value);
  const freshnessBound = enforceLiveGateFreshnessV1(parsed);
  return compileV1ReleaseCertificateV1(
    enforcePostPropagationChronologyV1(freshnessBound)
  );
}
