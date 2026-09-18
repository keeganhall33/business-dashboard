import type {
  OpportunityHandoffEvidenceFieldV1,
  OpportunityHandoffSourceV1,
  OpportunityHandoffTruthStateV1,
  OpportunityImportHandoffResultV1
} from "./opportunity-import-handoff-v1";

export const CANONICAL_OPPORTUNITY_UPSERT_PLAN_VERSION = "CANONICAL_OPPORTUNITY_UPSERT_PLAN_V1" as const;

export type CanonicalOpportunityLifecycleV1 =
  | "WATCH"
  | "CANDIDATE"
  | "QUALIFIED"
  | "ACTIVE"
  | "WAITING"
  | "STALE"
  | "WON"
  | "LOST"
  | "DISMISSED"
  | "UNKNOWN"
  | "NEEDS_VERIFICATION";

export type CanonicalOpportunitySourceIdentityV1 = Readonly<{
  source: OpportunityHandoffSourceV1;
  sourceCandidateKey: string;
  idempotencyKey: string;
  evidenceRefs: readonly string[];
}>;

export type CanonicalOpportunitySnapshotV1 = Readonly<{
  opportunityRef: string;
  active: boolean;
  lifecycleState: CanonicalOpportunityLifecycleV1;
  truthState: OpportunityHandoffTruthStateV1;
  entityRefs: readonly string[];
  sourceIdentities: readonly CanonicalOpportunitySourceIdentityV1[];
  evidenceRefs: readonly string[];
}>;

export type CanonicalOpportunityUpsertPlanDispositionV1 =
  | "CREATE"
  | "UPDATE"
  | "NO_CHANGE"
  | "VERIFY_REQUIRED"
  | "SUPPRESS";

export type CanonicalOpportunityMutationV1 = Readonly<{
  kind: "CREATE_CANONICAL_OPPORTUNITY" | "UPDATE_CANONICAL_OPPORTUNITY";
  targetOpportunityRef: string | null;
  lifecycleIntent: "CREATE_QUALIFIED" | "PRESERVE_EXISTING";
  title: string;
  entityRefs: readonly string[];
  sourceIdentity: Readonly<{
    source: OpportunityHandoffSourceV1;
    sourceCandidateKey: string;
    sourceInteractionRef: string;
    idempotencyKey: string;
  }>;
  evidenceRefs: readonly string[];
  evidenceBackedFields: Readonly<{
    summary: Readonly<OpportunityHandoffEvidenceFieldV1> | null;
    whyNow: Readonly<OpportunityHandoffEvidenceFieldV1> | null;
    recommendedNextAction: Readonly<OpportunityHandoffEvidenceFieldV1> | null;
    planningWindow: Readonly<OpportunityHandoffEvidenceFieldV1> | null;
  }>;
}>;

export type CanonicalOpportunityUpsertPlanV1 = Readonly<{
  version: typeof CANONICAL_OPPORTUNITY_UPSERT_PLAN_VERSION;
  handoffId: string;
  idempotencyKey: string;
  disposition: CanonicalOpportunityUpsertPlanDispositionV1;
  reasonCodes: readonly string[];
  matchedOpportunityRef: string | null;
  matchBasis: "NONE" | "EXPLICIT_EXISTING_REF" | "EXACT_SOURCE_IDENTITY";
  mutation: CanonicalOpportunityMutationV1 | null;
  canonicalPersistenceTarget: "CANONICAL_CRM_OPPORTUNITIES";
  legacyOpportunityPipelineAllowed: false;
  persistenceMutationPerformed: false;
  externalActionPerformed: false;
  writeAuthorityGranted: false;
}>;

export type CompileCanonicalOpportunityUpsertPlanInputV1 = Readonly<{
  handoff: OpportunityImportHandoffResultV1;
  existingOpportunities: readonly CanonicalOpportunitySnapshotV1[];
}>;

const TERMINAL_LIFECYCLE_STATES = new Set<CanonicalOpportunityLifecycleV1>(["WON", "LOST", "DISMISSED"]);

function requiredText(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value.trim();
}

function normalizeRefs(values: readonly string[] | undefined, label: string): readonly string[] {
  if (!Array.isArray(values)) throw new Error(`${label} must be an array`);
  return Object.freeze(
    [...new Set(values.map((value, index) => requiredText(value, `${label}[${index}]`)))].sort((a, b) =>
      a.localeCompare(b)
    )
  );
}

function freezeDeep<T>(value: T): Readonly<T> {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) freezeDeep(child);
    Object.freeze(value);
  }
  return value as Readonly<T>;
}

function intersects(left: readonly string[], right: readonly string[]): boolean {
  const rightSet = new Set(right);
  return left.some((value) => rightSet.has(value));
}

function isSubset(subset: readonly string[], superset: readonly string[]): boolean {
  const supersetSet = new Set(superset);
  return subset.every((value) => supersetSet.has(value));
}

function allIncomingEvidenceRefs(handoff: OpportunityImportHandoffResultV1): readonly string[] {
  const refs = [
    ...handoff.payload.evidenceRefs,
    ...(handoff.payload.summary?.evidenceRefs ?? []),
    ...(handoff.payload.whyNow?.evidenceRefs ?? []),
    ...(handoff.payload.recommendedNextAction?.evidenceRefs ?? []),
    ...(handoff.payload.planningWindow?.evidenceRefs ?? [])
  ];
  return normalizeRefs(refs, "handoff evidence refs");
}

function incomingEntityRefs(handoff: OpportunityImportHandoffResultV1): readonly string[] {
  return normalizeRefs(
    [...handoff.payload.personRefs, ...handoff.payload.organizationRefs],
    "handoff canonical entity refs"
  );
}

function exactSourceIdentityMatches(
  opportunities: readonly CanonicalOpportunitySnapshotV1[],
  handoff: OpportunityImportHandoffResultV1
): readonly CanonicalOpportunitySnapshotV1[] {
  return opportunities.filter((opportunity) =>
    opportunity.sourceIdentities.some(
      (identity) =>
        identity.source === handoff.source &&
        requiredText(identity.sourceCandidateKey, "source identity sourceCandidateKey") === handoff.payload.sourceCandidateKey &&
        requiredText(identity.idempotencyKey, "source identity idempotencyKey") === handoff.idempotencyKey
    )
  );
}

function duplicateOpportunityRefs(opportunities: readonly CanonicalOpportunitySnapshotV1[]): readonly string[] {
  const counts = new Map<string, number>();
  for (const opportunity of opportunities) {
    const ref = requiredText(opportunity.opportunityRef, "existing opportunity ref");
    counts.set(ref, (counts.get(ref) ?? 0) + 1);
  }
  return [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([ref]) => ref)
    .sort((a, b) => a.localeCompare(b));
}

function normalizedSnapshot(snapshot: CanonicalOpportunitySnapshotV1): CanonicalOpportunitySnapshotV1 {
  const opportunityRef = requiredText(snapshot.opportunityRef, "existing opportunity ref");
  if (typeof snapshot.active !== "boolean") throw new Error(`existing opportunity ${opportunityRef} active must be boolean`);
  if (!snapshot.lifecycleState) throw new Error(`existing opportunity ${opportunityRef} lifecycleState is required`);
  if (!snapshot.truthState) throw new Error(`existing opportunity ${opportunityRef} truthState is required`);

  const sourceIdentities = snapshot.sourceIdentities.map((identity, index) => ({
    source: identity.source,
    sourceCandidateKey: requiredText(identity.sourceCandidateKey, `sourceIdentities[${index}].sourceCandidateKey`),
    idempotencyKey: requiredText(identity.idempotencyKey, `sourceIdentities[${index}].idempotencyKey`),
    evidenceRefs: normalizeRefs(identity.evidenceRefs, `sourceIdentities[${index}].evidenceRefs`)
  }));

  return freezeDeep({
    opportunityRef,
    active: snapshot.active,
    lifecycleState: snapshot.lifecycleState,
    truthState: snapshot.truthState,
    entityRefs: normalizeRefs(snapshot.entityRefs, `existing opportunity ${opportunityRef} entityRefs`),
    sourceIdentities,
    evidenceRefs: normalizeRefs(snapshot.evidenceRefs, `existing opportunity ${opportunityRef} evidenceRefs`)
  });
}

function noMutationPlan(
  handoff: OpportunityImportHandoffResultV1,
  disposition: Extract<CanonicalOpportunityUpsertPlanDispositionV1, "NO_CHANGE" | "VERIFY_REQUIRED" | "SUPPRESS">,
  reasonCodes: readonly string[],
  matchedOpportunityRef: string | null = null,
  matchBasis: CanonicalOpportunityUpsertPlanV1["matchBasis"] = "NONE"
): CanonicalOpportunityUpsertPlanV1 {
  return freezeDeep({
    version: CANONICAL_OPPORTUNITY_UPSERT_PLAN_VERSION,
    handoffId: handoff.handoffId,
    idempotencyKey: handoff.idempotencyKey,
    disposition,
    reasonCodes: [...reasonCodes],
    matchedOpportunityRef,
    matchBasis,
    mutation: null,
    canonicalPersistenceTarget: "CANONICAL_CRM_OPPORTUNITIES" as const,
    legacyOpportunityPipelineAllowed: false as const,
    persistenceMutationPerformed: false as const,
    externalActionPerformed: false as const,
    writeAuthorityGranted: false as const
  });
}

function validateUpdateTarget(
  handoff: OpportunityImportHandoffResultV1,
  target: CanonicalOpportunitySnapshotV1,
  incomingEntities: readonly string[],
  matchBasis: Extract<CanonicalOpportunityUpsertPlanV1["matchBasis"], "EXPLICIT_EXISTING_REF" | "EXACT_SOURCE_IDENTITY">
): CanonicalOpportunityUpsertPlanV1 | null {
  if (!target.active) {
    return noMutationPlan(handoff, "VERIFY_REQUIRED", ["CANONICAL_OPPORTUNITY_INACTIVE"], target.opportunityRef, matchBasis);
  }
  if (target.truthState !== "KNOWN") {
    return noMutationPlan(
      handoff,
      "VERIFY_REQUIRED",
      [`CANONICAL_TRUTH_${target.truthState}_REQUIRES_VERIFICATION`],
      target.opportunityRef,
      matchBasis
    );
  }
  if (TERMINAL_LIFECYCLE_STATES.has(target.lifecycleState)) {
    return noMutationPlan(
      handoff,
      "VERIFY_REQUIRED",
      [`TERMINAL_${target.lifecycleState}_PRESERVED`],
      target.opportunityRef,
      matchBasis
    );
  }
  if (target.entityRefs.length === 0) {
    return noMutationPlan(
      handoff,
      "VERIFY_REQUIRED",
      ["EXISTING_CANONICAL_ENTITY_ANCHOR_REQUIRED"],
      target.opportunityRef,
      matchBasis
    );
  }
  if (incomingEntities.length > 0 && !intersects(target.entityRefs, incomingEntities)) {
    return noMutationPlan(
      handoff,
      "VERIFY_REQUIRED",
      ["CANONICAL_ENTITY_ANCHOR_CONFLICT"],
      target.opportunityRef,
      matchBasis
    );
  }
  return null;
}

function createMutation(
  handoff: OpportunityImportHandoffResultV1,
  kind: CanonicalOpportunityMutationV1["kind"],
  targetOpportunityRef: string | null,
  entityRefs: readonly string[],
  evidenceRefs: readonly string[]
): CanonicalOpportunityMutationV1 {
  return freezeDeep({
    kind,
    targetOpportunityRef,
    lifecycleIntent: kind === "CREATE_CANONICAL_OPPORTUNITY" ? ("CREATE_QUALIFIED" as const) : ("PRESERVE_EXISTING" as const),
    title: handoff.payload.title,
    entityRefs: [...entityRefs],
    sourceIdentity: {
      source: handoff.source,
      sourceCandidateKey: handoff.payload.sourceCandidateKey,
      sourceInteractionRef: handoff.sourceInteractionRef,
      idempotencyKey: handoff.idempotencyKey
    },
    evidenceRefs: [...evidenceRefs],
    evidenceBackedFields: {
      summary: handoff.payload.summary,
      whyNow: handoff.payload.whyNow,
      recommendedNextAction: handoff.payload.recommendedNextAction,
      planningWindow: handoff.payload.planningWindow
    }
  });
}

function mutationPlan(
  handoff: OpportunityImportHandoffResultV1,
  disposition: Extract<CanonicalOpportunityUpsertPlanDispositionV1, "CREATE" | "UPDATE">,
  reasonCodes: readonly string[],
  mutation: CanonicalOpportunityMutationV1,
  matchedOpportunityRef: string | null,
  matchBasis: CanonicalOpportunityUpsertPlanV1["matchBasis"]
): CanonicalOpportunityUpsertPlanV1 {
  return freezeDeep({
    version: CANONICAL_OPPORTUNITY_UPSERT_PLAN_VERSION,
    handoffId: handoff.handoffId,
    idempotencyKey: handoff.idempotencyKey,
    disposition,
    reasonCodes: [...reasonCodes],
    matchedOpportunityRef,
    matchBasis,
    mutation,
    canonicalPersistenceTarget: "CANONICAL_CRM_OPPORTUNITIES" as const,
    legacyOpportunityPipelineAllowed: false as const,
    persistenceMutationPerformed: false as const,
    externalActionPerformed: false as const,
    writeAuthorityGranted: false as const
  });
}

export function compileCanonicalOpportunityUpsertPlanV1(
  input: CompileCanonicalOpportunityUpsertPlanInputV1
): CanonicalOpportunityUpsertPlanV1 {
  if (!input || typeof input !== "object") throw new Error("input is required");
  const handoff = input.handoff;
  if (!handoff || typeof handoff !== "object") throw new Error("handoff is required");
  if (handoff.crmMutationPerformed || handoff.externalActionPerformed || handoff.writeAuthorityGranted) {
    throw new Error("handoff must be a side-effect-free governed artifact");
  }
  if (!Array.isArray(input.existingOpportunities)) throw new Error("existingOpportunities must be an array");

  const existingOpportunities = input.existingOpportunities.map(normalizedSnapshot);
  const duplicateRefs = duplicateOpportunityRefs(existingOpportunities);
  if (duplicateRefs.length > 0) {
    return noMutationPlan(handoff, "VERIFY_REQUIRED", ["CANONICAL_SNAPSHOT_DUPLICATE_REF", ...duplicateRefs]);
  }

  if (handoff.disposition === "WATCH_ONLY") {
    return noMutationPlan(handoff, "SUPPRESS", ["WATCH_ONLY_NOT_CANONICAL_WRITE_ELIGIBLE"]);
  }
  if (handoff.disposition === "NEEDS_VERIFICATION") {
    return noMutationPlan(handoff, "VERIFY_REQUIRED", ["HANDOFF_REQUIRES_VERIFICATION", ...handoff.reasonCodes]);
  }

  const incomingEntities = incomingEntityRefs(handoff);
  const incomingEvidence = allIncomingEvidenceRefs(handoff);
  const sourceMatches = exactSourceIdentityMatches(existingOpportunities, handoff);

  if (sourceMatches.length > 1) {
    return noMutationPlan(handoff, "VERIFY_REQUIRED", ["EXACT_SOURCE_IDENTITY_AMBIGUOUS"]);
  }

  if (handoff.disposition === "LINK_TO_EXISTING") {
    const explicitRef = handoff.payload.existingOpportunityRef;
    if (!explicitRef) {
      return noMutationPlan(handoff, "VERIFY_REQUIRED", ["EXPLICIT_EXISTING_OPPORTUNITY_REF_REQUIRED"]);
    }
    const target = existingOpportunities.find((opportunity) => opportunity.opportunityRef === explicitRef);
    if (!target) {
      return noMutationPlan(handoff, "VERIFY_REQUIRED", ["EXPLICIT_EXISTING_OPPORTUNITY_NOT_FOUND"]);
    }
    if (sourceMatches.length === 1 && sourceMatches[0]?.opportunityRef !== target.opportunityRef) {
      return noMutationPlan(handoff, "VERIFY_REQUIRED", ["SOURCE_IDENTITY_CROSS_RECORD_CONFLICT"]);
    }

    const invalidTarget = validateUpdateTarget(handoff, target, incomingEntities, "EXPLICIT_EXISTING_REF");
    if (invalidTarget) return invalidTarget;

    const sourceIdentityAlreadyRecorded = target.sourceIdentities.some(
      (identity) => identity.source === handoff.source && identity.idempotencyKey === handoff.idempotencyKey
    );
    const evidenceAlreadyRecorded = isSubset(incomingEvidence, target.evidenceRefs);
    const entityEvidenceAlreadyRecorded = incomingEntities.length === 0 || isSubset(incomingEntities, target.entityRefs);

    if (sourceIdentityAlreadyRecorded && evidenceAlreadyRecorded && entityEvidenceAlreadyRecorded) {
      return noMutationPlan(
        handoff,
        "NO_CHANGE",
        ["EXPLICIT_LINK_ALREADY_RECORDED"],
        target.opportunityRef,
        "EXPLICIT_EXISTING_REF"
      );
    }

    return mutationPlan(
      handoff,
      "UPDATE",
      ["EXPLICIT_EXISTING_OPPORTUNITY_LINK"],
      createMutation(
        handoff,
        "UPDATE_CANONICAL_OPPORTUNITY",
        target.opportunityRef,
        incomingEntities,
        incomingEvidence
      ),
      target.opportunityRef,
      "EXPLICIT_EXISTING_REF"
    );
  }

  if (handoff.disposition !== "READY_FOR_CANONICAL_UPSERT") {
    return noMutationPlan(handoff, "VERIFY_REQUIRED", ["UNSUPPORTED_HANDOFF_DISPOSITION"]);
  }
  if (incomingEntities.length === 0) {
    return noMutationPlan(handoff, "VERIFY_REQUIRED", ["CANONICAL_ENTITY_ANCHOR_REQUIRED"]);
  }

  if (sourceMatches.length === 1) {
    const target = sourceMatches[0];
    if (!target) return noMutationPlan(handoff, "VERIFY_REQUIRED", ["EXACT_SOURCE_IDENTITY_AMBIGUOUS"]);
    const invalidTarget = validateUpdateTarget(handoff, target, incomingEntities, "EXACT_SOURCE_IDENTITY");
    if (invalidTarget) return invalidTarget;

    const evidenceAlreadyRecorded = isSubset(incomingEvidence, target.evidenceRefs);
    const entityEvidenceAlreadyRecorded = isSubset(incomingEntities, target.entityRefs);
    if (evidenceAlreadyRecorded && entityEvidenceAlreadyRecorded) {
      return noMutationPlan(
        handoff,
        "NO_CHANGE",
        ["EXACT_SOURCE_IDENTITY_ALREADY_RECORDED"],
        target.opportunityRef,
        "EXACT_SOURCE_IDENTITY"
      );
    }

    return mutationPlan(
      handoff,
      "UPDATE",
      ["EXACT_SOURCE_IDENTITY_MATCH"],
      createMutation(
        handoff,
        "UPDATE_CANONICAL_OPPORTUNITY",
        target.opportunityRef,
        incomingEntities,
        incomingEvidence
      ),
      target.opportunityRef,
      "EXACT_SOURCE_IDENTITY"
    );
  }

  return mutationPlan(
    handoff,
    "CREATE",
    ["QUALIFIED_HANDOFF_WITH_NO_EXISTING_SOURCE_IDENTITY"],
    createMutation(handoff, "CREATE_CANONICAL_OPPORTUNITY", null, incomingEntities, incomingEvidence),
    null,
    "NONE"
  );
}
