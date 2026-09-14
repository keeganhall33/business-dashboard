import type { CorrectionRouteResultV1 } from "./correction-router-v1";
import type { LearningTruthState } from "./learning-object-v1";

export const CORRECTION_IMPACT_PLAN_VERSION = "CORRECTION_IMPACT_PLAN_V1" as const;
export const MAX_CORRECTION_IMPACT_TARGETS = 40;

export const correctionProjectionKinds = [
  "CANONICAL_CRM",
  "RECOMMENDATION",
  "DASHBOARD",
  "ASK_JEEVES"
] as const;

export type CorrectionProjectionKindV1 = (typeof correctionProjectionKinds)[number];
export type CorrectionImpactModeV1 = "CACHE_INVALIDATION" | "SAFE_REFRESH" | "WRITE_REQUIRED";
export type CorrectionImpactActionV1 = "INVALIDATE" | "REFRESH" | "REVIEW_REQUIRED";

export interface CorrectionImpactTargetV1 {
  canonical_ref: string;
  projection: CorrectionProjectionKindV1;
  truth_state: LearningTruthState;
  impact_mode: CorrectionImpactModeV1;
  identity_state: "RESOLVED" | "AMBIGUOUS";
}

export interface PlannedCorrectionImpactV1 {
  canonicalRef: string;
  projection: CorrectionProjectionKindV1;
  truthState: LearningTruthState;
  action: CorrectionImpactActionV1;
  reasonCode:
    | "CORRECTION_INVALIDATES_PROJECTION"
    | "SAFE_REFRESH_ALLOWED"
    | "WRITE_REQUIRES_REVIEW"
    | "UNSAFE_TRUTH_REQUIRES_REVIEW";
}

export type CorrectionImpactPlanResultV1 =
  | {
      version: typeof CORRECTION_IMPACT_PLAN_VERSION;
      status: "PLAN";
      reasonCode: "REVIEWED_CORRECTION_IMPACT_PLANNED";
      correctionId: string;
      sourceRefs: readonly string[];
      impacts: readonly Readonly<PlannedCorrectionImpactV1>[];
      externalMutationPerformed: false;
    }
  | {
      version: typeof CORRECTION_IMPACT_PLAN_VERSION;
      status: "WITHHELD";
      reasonCode:
        | "CORRECTION_NOT_REVIEWED"
        | "MISSING_EVIDENCE"
        | "NO_AFFECTED_TARGETS"
        | "AMBIGUOUS_IDENTITY"
        | "CONFLICTING_TARGET_DEFINITION"
        | "INVALID_INPUT";
      correctionId: null;
      sourceRefs: readonly string[];
      impacts: readonly [];
      externalMutationPerformed: false;
    };

function text(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function withheld(
  reasonCode: Extract<CorrectionImpactPlanResultV1, { status: "WITHHELD" }>["reasonCode"],
  sourceRefs: readonly string[] = []
): CorrectionImpactPlanResultV1 {
  return Object.freeze({
    version: CORRECTION_IMPACT_PLAN_VERSION,
    status: "WITHHELD",
    reasonCode,
    correctionId: null,
    sourceRefs: Object.freeze([...sourceRefs].sort()),
    impacts: Object.freeze([]) as readonly [],
    externalMutationPerformed: false
  });
}

function validTarget(target: CorrectionImpactTargetV1): boolean {
  return Boolean(
    text(target?.canonical_ref) &&
    correctionProjectionKinds.includes(target.projection) &&
    ["KNOWN", "INFERRED", "UNKNOWN", "STALE", "CONFLICTED"].includes(target.truth_state) &&
    ["CACHE_INVALIDATION", "SAFE_REFRESH", "WRITE_REQUIRED"].includes(target.impact_mode) &&
    ["RESOLVED", "AMBIGUOUS"].includes(target.identity_state)
  );
}

function planImpact(target: CorrectionImpactTargetV1): Readonly<PlannedCorrectionImpactV1> {
  let action: CorrectionImpactActionV1;
  let reasonCode: PlannedCorrectionImpactV1["reasonCode"];

  if (target.truth_state === "UNKNOWN" || target.truth_state === "CONFLICTED") {
    action = "REVIEW_REQUIRED";
    reasonCode = "UNSAFE_TRUTH_REQUIRES_REVIEW";
  } else if (target.impact_mode === "WRITE_REQUIRED") {
    action = "REVIEW_REQUIRED";
    reasonCode = "WRITE_REQUIRES_REVIEW";
  } else if (target.impact_mode === "SAFE_REFRESH" || target.truth_state === "STALE") {
    action = "REFRESH";
    reasonCode = "SAFE_REFRESH_ALLOWED";
  } else {
    action = "INVALIDATE";
    reasonCode = "CORRECTION_INVALIDATES_PROJECTION";
  }

  return Object.freeze({
    canonicalRef: target.canonical_ref.trim(),
    projection: target.projection,
    truthState: target.truth_state,
    action,
    reasonCode
  });
}

export function planCorrectionImpactV1(
  correction: CorrectionRouteResultV1,
  targets: readonly CorrectionImpactTargetV1[]
): CorrectionImpactPlanResultV1 {
  const sourceRefs = Array.isArray(correction?.sourceRefs) ? correction.sourceRefs : [];
  if (correction?.status !== "CANDIDATE") return withheld("CORRECTION_NOT_REVIEWED", sourceRefs);
  if (sourceRefs.length === 0 || sourceRefs.some((ref) => !text(ref))) {
    return withheld("MISSING_EVIDENCE", sourceRefs);
  }
  if (!Array.isArray(targets) || targets.length === 0) return withheld("NO_AFFECTED_TARGETS", sourceRefs);
  if (targets.length > MAX_CORRECTION_IMPACT_TARGETS || targets.some((target) => !validTarget(target))) {
    return withheld("INVALID_INPUT", sourceRefs);
  }
  if (targets.some((target) => target.identity_state === "AMBIGUOUS")) {
    return withheld("AMBIGUOUS_IDENTITY", sourceRefs);
  }

  const allowedRefs = new Set(correction.affectedScope);
  if (targets.some((target) => !allowedRefs.has(target.canonical_ref.trim()))) {
    return withheld("INVALID_INPUT", sourceRefs);
  }

  const byKey = new Map<string, CorrectionImpactTargetV1>();
  for (const target of targets) {
    const normalized = { ...target, canonical_ref: target.canonical_ref.trim() };
    const key = `${normalized.projection}:${normalized.canonical_ref}`;
    const existing = byKey.get(key);
    if (
      existing &&
      (existing.truth_state !== normalized.truth_state || existing.impact_mode !== normalized.impact_mode)
    ) {
      return withheld("CONFLICTING_TARGET_DEFINITION", sourceRefs);
    }
    if (!existing) byKey.set(key, normalized);
  }

  const correctionId = correction.candidate.learning_id;
  const impacts = [...byKey.values()]
    .sort((a, b) => {
      const projection = a.projection.localeCompare(b.projection);
      return projection || a.canonical_ref.localeCompare(b.canonical_ref);
    })
    .map(planImpact);

  return Object.freeze({
    version: CORRECTION_IMPACT_PLAN_VERSION,
    status: "PLAN",
    reasonCode: "REVIEWED_CORRECTION_IMPACT_PLANNED",
    correctionId,
    sourceRefs: Object.freeze([...new Set(sourceRefs)].sort()),
    impacts: Object.freeze(impacts),
    externalMutationPerformed: false
  });
}
