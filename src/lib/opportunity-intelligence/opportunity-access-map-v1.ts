export type OpportunityAccessFactKindV1 =
  | "DECISION_MAKER"
  | "SPONSORSHIP_LINK"
  | "WARM_ACCESS_PATH"
  | "PLANNING_WINDOW";

export type OpportunityAccessTruthStateV1 =
  | "KNOWN"
  | "INFERRED"
  | "UNKNOWN"
  | "STALE"
  | "CONFLICTED";

export type OpportunityAccessFreshnessStateV1 = "CURRENT" | "STALE" | "UNKNOWN";
export type OpportunityAccessEntityTypeV1 = "PERSON" | "COMPANY";

export type OpportunityAccessEvidenceBaseV1 = {
  evidenceId: string;
  opportunityId: string;
  kind: OpportunityAccessFactKindV1;
  truthState: OpportunityAccessTruthStateV1;
  freshnessState: OpportunityAccessFreshnessStateV1;
  observedAt: string;
  evidenceRefs: readonly string[];
};

export type OpportunityDecisionMakerEvidenceV1 = OpportunityAccessEvidenceBaseV1 & {
  kind: "DECISION_MAKER";
  personCanonicalId: string;
  personLabel: string;
  organizationCanonicalId: string;
  organizationLabel: string;
  decisionClass: string;
};

export type OpportunitySponsorshipLinkEvidenceV1 = OpportunityAccessEvidenceBaseV1 & {
  kind: "SPONSORSHIP_LINK";
  propertyCanonicalId: string;
  propertyLabel: string;
  sponsorCanonicalId: string;
  sponsorLabel: string;
  relationshipLabel: string;
};

export type OpportunityAccessPathNodeV1 = {
  entityType: OpportunityAccessEntityTypeV1;
  canonicalId: string;
  label: string;
};

export type OpportunityWarmAccessPathEvidenceV1 = OpportunityAccessEvidenceBaseV1 & {
  kind: "WARM_ACCESS_PATH";
  path: readonly OpportunityAccessPathNodeV1[];
  reasonForIntroduction: string;
};

export type OpportunityPlanningWindowEvidenceV1 = OpportunityAccessEvidenceBaseV1 & {
  kind: "PLANNING_WINDOW";
  windowType: string;
  windowStart: string;
  windowEnd: string;
  whyThisWindow: string;
};

export type OpportunityAccessEvidenceV1 =
  | OpportunityDecisionMakerEvidenceV1
  | OpportunitySponsorshipLinkEvidenceV1
  | OpportunityWarmAccessPathEvidenceV1
  | OpportunityPlanningWindowEvidenceV1;

export type OpportunityAccessWithheldReasonV1 =
  | "INFERRED"
  | "UNKNOWN"
  | "STALE"
  | "CONFLICTED"
  | "FRESHNESS_UNKNOWN"
  | "FUTURE_EVIDENCE"
  | "EVIDENCE_MISSING"
  | "WINDOW_ELAPSED"
  | "DUPLICATE_CONFLICT";

export type OpportunityAccessWithheldV1 = {
  kind: OpportunityAccessFactKindV1;
  evidenceId: string;
  reason: OpportunityAccessWithheldReasonV1;
};

export type OpportunityAccessCoverageStateV1 = "EVIDENCED" | "NEEDS_VERIFICATION" | "MISSING";

export type OpportunityAccessProjectedBaseV1 = {
  evidenceIds: readonly string[];
  observedAt: string;
  evidenceRefs: readonly string[];
};

export type OpportunityDecisionMakerV1 = OpportunityAccessProjectedBaseV1 & {
  personCanonicalId: string;
  personLabel: string;
  organizationCanonicalId: string;
  organizationLabel: string;
  decisionClass: string;
};

export type OpportunitySponsorshipLinkV1 = OpportunityAccessProjectedBaseV1 & {
  propertyCanonicalId: string;
  propertyLabel: string;
  sponsorCanonicalId: string;
  sponsorLabel: string;
  relationshipLabel: string;
};

export type OpportunityWarmAccessPathV1 = OpportunityAccessProjectedBaseV1 & {
  path: readonly OpportunityAccessPathNodeV1[];
  reasonForIntroduction: string;
};

export type OpportunityPlanningWindowV1 = OpportunityAccessProjectedBaseV1 & {
  windowType: string;
  windowStart: string;
  windowEnd: string;
  whyThisWindow: string;
};

export type OpportunityAccessMapV1 = {
  opportunityId: string;
  asOf: string;
  decisionMakers: readonly OpportunityDecisionMakerV1[];
  sponsorshipLinks: readonly OpportunitySponsorshipLinkV1[];
  warmAccessPaths: readonly OpportunityWarmAccessPathV1[];
  planningWindows: readonly OpportunityPlanningWindowV1[];
  coverage: Readonly<Record<OpportunityAccessFactKindV1, OpportunityAccessCoverageStateV1>>;
  researchGaps: readonly OpportunityAccessFactKindV1[];
  withheld: readonly OpportunityAccessWithheldV1[];
  verificationRequired: boolean;
};

const INPUT_KEYS = new Set(["opportunityId", "asOf", "evidence"]);
const BASE_KEYS = ["evidenceId", "opportunityId", "kind", "truthState", "freshnessState", "observedAt", "evidenceRefs"] as const;
const KIND_KEYS: Readonly<Record<OpportunityAccessFactKindV1, readonly string[]>> = {
  DECISION_MAKER: ["personCanonicalId", "personLabel", "organizationCanonicalId", "organizationLabel", "decisionClass"],
  SPONSORSHIP_LINK: ["propertyCanonicalId", "propertyLabel", "sponsorCanonicalId", "sponsorLabel", "relationshipLabel"],
  WARM_ACCESS_PATH: ["path", "reasonForIntroduction"],
  PLANNING_WINDOW: ["windowType", "windowStart", "windowEnd", "whyThisWindow"]
};
const KINDS = new Set<OpportunityAccessFactKindV1>(["DECISION_MAKER", "SPONSORSHIP_LINK", "WARM_ACCESS_PATH", "PLANNING_WINDOW"]);
const TRUTH_STATES = new Set<OpportunityAccessTruthStateV1>(["KNOWN", "INFERRED", "UNKNOWN", "STALE", "CONFLICTED"]);
const FRESHNESS_STATES = new Set<OpportunityAccessFreshnessStateV1>(["CURRENT", "STALE", "UNKNOWN"]);
const ENTITY_TYPES = new Set<OpportunityAccessEntityTypeV1>(["PERSON", "COMPANY"]);
const KIND_ORDER: readonly OpportunityAccessFactKindV1[] = ["DECISION_MAKER", "SPONSORSHIP_LINK", "WARM_ACCESS_PATH", "PLANNING_WINDOW"];

type NormalizedEvidence = OpportunityAccessEvidenceV1;

function fail(code: string): never {
  throw new Error(code);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value == null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function requiredText(value: unknown, code: string): string {
  if (typeof value !== "string" || !value.trim()) return fail(code);
  return value.trim();
}

function iso(value: unknown, code: string): string {
  const text = requiredText(value, code);
  const time = Date.parse(text);
  if (!Number.isFinite(time)) return fail(code);
  return new Date(time).toISOString();
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function evidenceRefs(value: unknown): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || !item.trim())) {
    return fail("OPPORTUNITY_ACCESS_EVIDENCE_REFS_INVALID");
  }
  return uniqueSorted(value.map((item) => (item as string).trim()));
}

function pathNodes(value: unknown): OpportunityAccessPathNodeV1[] {
  if (!Array.isArray(value) || value.length < 2) return fail("OPPORTUNITY_ACCESS_PATH_INVALID");
  return value.map((raw) => {
    if (!isPlainObject(raw) || Object.keys(raw).some((key) => !["entityType", "canonicalId", "label"].includes(key))) {
      return fail("OPPORTUNITY_ACCESS_PATH_NODE_INVALID");
    }
    if (!ENTITY_TYPES.has(raw.entityType as OpportunityAccessEntityTypeV1)) return fail("OPPORTUNITY_ACCESS_PATH_ENTITY_TYPE_INVALID");
    return {
      entityType: raw.entityType as OpportunityAccessEntityTypeV1,
      canonicalId: requiredText(raw.canonicalId, "OPPORTUNITY_ACCESS_PATH_CANONICAL_ID_INVALID"),
      label: requiredText(raw.label, "OPPORTUNITY_ACCESS_PATH_LABEL_INVALID")
    };
  });
}

function normalizeEvidence(raw: unknown, opportunityId: string): NormalizedEvidence {
  if (!isPlainObject(raw)) return fail("OPPORTUNITY_ACCESS_EVIDENCE_INVALID");
  if (!KINDS.has(raw.kind as OpportunityAccessFactKindV1)) return fail("OPPORTUNITY_ACCESS_KIND_INVALID");
  const kind = raw.kind as OpportunityAccessFactKindV1;
  const allowed = new Set<string>([...BASE_KEYS, ...KIND_KEYS[kind]]);
  if (Object.keys(raw).some((key) => !allowed.has(key))) return fail("OPPORTUNITY_ACCESS_EVIDENCE_INVALID");
  if (requiredText(raw.opportunityId, "OPPORTUNITY_ACCESS_OPPORTUNITY_ID_INVALID") !== opportunityId) {
    return fail("OPPORTUNITY_ACCESS_SCOPE_MISMATCH");
  }
  if (!TRUTH_STATES.has(raw.truthState as OpportunityAccessTruthStateV1)) return fail("OPPORTUNITY_ACCESS_TRUTH_STATE_INVALID");
  if (!FRESHNESS_STATES.has(raw.freshnessState as OpportunityAccessFreshnessStateV1)) return fail("OPPORTUNITY_ACCESS_FRESHNESS_STATE_INVALID");

  const base = {
    evidenceId: requiredText(raw.evidenceId, "OPPORTUNITY_ACCESS_EVIDENCE_ID_INVALID"),
    opportunityId,
    kind,
    truthState: raw.truthState as OpportunityAccessTruthStateV1,
    freshnessState: raw.freshnessState as OpportunityAccessFreshnessStateV1,
    observedAt: iso(raw.observedAt, "OPPORTUNITY_ACCESS_OBSERVED_AT_INVALID"),
    evidenceRefs: evidenceRefs(raw.evidenceRefs)
  };

  if (kind === "DECISION_MAKER") {
    return {
      ...base,
      kind,
      personCanonicalId: requiredText(raw.personCanonicalId, "OPPORTUNITY_ACCESS_PERSON_ID_INVALID"),
      personLabel: requiredText(raw.personLabel, "OPPORTUNITY_ACCESS_PERSON_LABEL_INVALID"),
      organizationCanonicalId: requiredText(raw.organizationCanonicalId, "OPPORTUNITY_ACCESS_ORGANIZATION_ID_INVALID"),
      organizationLabel: requiredText(raw.organizationLabel, "OPPORTUNITY_ACCESS_ORGANIZATION_LABEL_INVALID"),
      decisionClass: requiredText(raw.decisionClass, "OPPORTUNITY_ACCESS_DECISION_CLASS_INVALID")
    };
  }
  if (kind === "SPONSORSHIP_LINK") {
    return {
      ...base,
      kind,
      propertyCanonicalId: requiredText(raw.propertyCanonicalId, "OPPORTUNITY_ACCESS_PROPERTY_ID_INVALID"),
      propertyLabel: requiredText(raw.propertyLabel, "OPPORTUNITY_ACCESS_PROPERTY_LABEL_INVALID"),
      sponsorCanonicalId: requiredText(raw.sponsorCanonicalId, "OPPORTUNITY_ACCESS_SPONSOR_ID_INVALID"),
      sponsorLabel: requiredText(raw.sponsorLabel, "OPPORTUNITY_ACCESS_SPONSOR_LABEL_INVALID"),
      relationshipLabel: requiredText(raw.relationshipLabel, "OPPORTUNITY_ACCESS_RELATIONSHIP_LABEL_INVALID")
    };
  }
  if (kind === "WARM_ACCESS_PATH") {
    return {
      ...base,
      kind,
      path: pathNodes(raw.path),
      reasonForIntroduction: requiredText(raw.reasonForIntroduction, "OPPORTUNITY_ACCESS_INTRO_REASON_INVALID")
    };
  }
  const windowStart = iso(raw.windowStart, "OPPORTUNITY_ACCESS_WINDOW_START_INVALID");
  const windowEnd = iso(raw.windowEnd, "OPPORTUNITY_ACCESS_WINDOW_END_INVALID");
  if (Date.parse(windowStart) > Date.parse(windowEnd)) return fail("OPPORTUNITY_ACCESS_WINDOW_RANGE_INVALID");
  return {
    ...base,
    kind,
    windowType: requiredText(raw.windowType, "OPPORTUNITY_ACCESS_WINDOW_TYPE_INVALID"),
    windowStart,
    windowEnd,
    whyThisWindow: requiredText(raw.whyThisWindow, "OPPORTUNITY_ACCESS_WINDOW_REASON_INVALID")
  };
}

function withheldReason(evidence: NormalizedEvidence, asOf: string): OpportunityAccessWithheldReasonV1 | null {
  if (evidence.truthState === "INFERRED") return "INFERRED";
  if (evidence.truthState === "UNKNOWN") return "UNKNOWN";
  if (evidence.truthState === "STALE" || evidence.freshnessState === "STALE") return "STALE";
  if (evidence.truthState === "CONFLICTED") return "CONFLICTED";
  if (evidence.freshnessState === "UNKNOWN") return "FRESHNESS_UNKNOWN";
  if (Date.parse(evidence.observedAt) > Date.parse(asOf)) return "FUTURE_EVIDENCE";
  if (evidence.evidenceRefs.length === 0) return "EVIDENCE_MISSING";
  if (evidence.kind === "PLANNING_WINDOW" && Date.parse(evidence.windowEnd) < Date.parse(asOf)) return "WINDOW_ELAPSED";
  return null;
}

function semanticKey(evidence: NormalizedEvidence): string {
  if (evidence.kind === "DECISION_MAKER") return `${evidence.kind}:${evidence.personCanonicalId}:${evidence.organizationCanonicalId}:${evidence.decisionClass}`;
  if (evidence.kind === "SPONSORSHIP_LINK") return `${evidence.kind}:${evidence.propertyCanonicalId}:${evidence.sponsorCanonicalId}`;
  if (evidence.kind === "WARM_ACCESS_PATH") return `${evidence.kind}:${evidence.path.map((node) => `${node.entityType}:${node.canonicalId}`).join(">")}`;
  return `${evidence.kind}:${evidence.windowType}`;
}

function evidenceSignature(evidence: NormalizedEvidence): string {
  if (evidence.kind === "DECISION_MAKER") return JSON.stringify({ personCanonicalId: evidence.personCanonicalId, personLabel: evidence.personLabel, organizationCanonicalId: evidence.organizationCanonicalId, organizationLabel: evidence.organizationLabel, decisionClass: evidence.decisionClass });
  if (evidence.kind === "SPONSORSHIP_LINK") return JSON.stringify({ propertyCanonicalId: evidence.propertyCanonicalId, propertyLabel: evidence.propertyLabel, sponsorCanonicalId: evidence.sponsorCanonicalId, sponsorLabel: evidence.sponsorLabel, relationshipLabel: evidence.relationshipLabel });
  if (evidence.kind === "WARM_ACCESS_PATH") return JSON.stringify({ path: evidence.path, reasonForIntroduction: evidence.reasonForIntroduction });
  return JSON.stringify({ windowType: evidence.windowType, windowStart: evidence.windowStart, windowEnd: evidence.windowEnd, whyThisWindow: evidence.whyThisWindow });
}

function projectedBase(entries: readonly NormalizedEvidence[]): OpportunityAccessProjectedBaseV1 {
  return {
    evidenceIds: uniqueSorted(entries.map((entry) => entry.evidenceId)),
    observedAt: entries.map((entry) => entry.observedAt).sort().at(-1)!,
    evidenceRefs: uniqueSorted(entries.flatMap((entry) => [...entry.evidenceRefs]))
  };
}

function coverageFor(kind: OpportunityAccessFactKindV1, count: number, withheld: readonly OpportunityAccessWithheldV1[]): OpportunityAccessCoverageStateV1 {
  if (count > 0) return "EVIDENCED";
  return withheld.some((entry) => entry.kind === kind) ? "NEEDS_VERIFICATION" : "MISSING";
}

export function projectOpportunityAccessMapV1(input: {
  opportunityId: string;
  asOf: string | Date;
  evidence?: readonly OpportunityAccessEvidenceV1[] | null;
}): OpportunityAccessMapV1 {
  if (!isPlainObject(input) || Object.keys(input).some((key) => !INPUT_KEYS.has(key))) return fail("OPPORTUNITY_ACCESS_INPUT_INVALID");
  const opportunityId = requiredText(input.opportunityId, "OPPORTUNITY_ACCESS_OPPORTUNITY_ID_INVALID");
  const asOf = input.asOf instanceof Date ? input.asOf.toISOString() : iso(input.asOf, "OPPORTUNITY_ACCESS_AS_OF_INVALID");
  if (input.evidence != null && !Array.isArray(input.evidence)) return fail("OPPORTUNITY_ACCESS_EVIDENCE_SET_INVALID");

  const normalized = (input.evidence ?? []).map((entry) => normalizeEvidence(entry, opportunityId));
  const withheld: OpportunityAccessWithheldV1[] = [];
  const eligible: NormalizedEvidence[] = [];

  for (const entry of normalized) {
    const reason = withheldReason(entry, asOf);
    if (reason) withheld.push({ kind: entry.kind, evidenceId: entry.evidenceId, reason });
    else eligible.push(entry);
  }

  const grouped = new Map<string, NormalizedEvidence[]>();
  for (const entry of eligible) {
    const key = semanticKey(entry);
    const bucket = grouped.get(key) ?? [];
    bucket.push(entry);
    grouped.set(key, bucket);
  }

  const decisionMakers: OpportunityDecisionMakerV1[] = [];
  const sponsorshipLinks: OpportunitySponsorshipLinkV1[] = [];
  const warmAccessPaths: OpportunityWarmAccessPathV1[] = [];
  const planningWindows: OpportunityPlanningWindowV1[] = [];

  for (const bucket of grouped.values()) {
    const first = bucket[0];
    if (new Set(bucket.map(evidenceSignature)).size > 1) {
      for (const entry of bucket) withheld.push({ kind: entry.kind, evidenceId: entry.evidenceId, reason: "DUPLICATE_CONFLICT" });
      continue;
    }
    const base = projectedBase(bucket);
    if (first.kind === "DECISION_MAKER") {
      decisionMakers.push({ ...base, personCanonicalId: first.personCanonicalId, personLabel: first.personLabel, organizationCanonicalId: first.organizationCanonicalId, organizationLabel: first.organizationLabel, decisionClass: first.decisionClass });
    } else if (first.kind === "SPONSORSHIP_LINK") {
      sponsorshipLinks.push({ ...base, propertyCanonicalId: first.propertyCanonicalId, propertyLabel: first.propertyLabel, sponsorCanonicalId: first.sponsorCanonicalId, sponsorLabel: first.sponsorLabel, relationshipLabel: first.relationshipLabel });
    } else if (first.kind === "WARM_ACCESS_PATH") {
      warmAccessPaths.push({ ...base, path: first.path, reasonForIntroduction: first.reasonForIntroduction });
    } else {
      planningWindows.push({ ...base, windowType: first.windowType, windowStart: first.windowStart, windowEnd: first.windowEnd, whyThisWindow: first.whyThisWindow });
    }
  }

  decisionMakers.sort((a, b) => a.organizationLabel.localeCompare(b.organizationLabel) || a.personLabel.localeCompare(b.personLabel) || a.decisionClass.localeCompare(b.decisionClass));
  sponsorshipLinks.sort((a, b) => a.propertyLabel.localeCompare(b.propertyLabel) || a.sponsorLabel.localeCompare(b.sponsorLabel));
  warmAccessPaths.sort((a, b) => a.path.map((node) => node.label).join(" > ").localeCompare(b.path.map((node) => node.label).join(" > ")));
  planningWindows.sort((a, b) => a.windowStart.localeCompare(b.windowStart) || a.windowType.localeCompare(b.windowType));
  withheld.sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || a.evidenceId.localeCompare(b.evidenceId) || a.reason.localeCompare(b.reason));

  const counts: Readonly<Record<OpportunityAccessFactKindV1, number>> = {
    DECISION_MAKER: decisionMakers.length,
    SPONSORSHIP_LINK: sponsorshipLinks.length,
    WARM_ACCESS_PATH: warmAccessPaths.length,
    PLANNING_WINDOW: planningWindows.length
  };
  const coverage = Object.fromEntries(KIND_ORDER.map((kind) => [kind, coverageFor(kind, counts[kind], withheld)])) as Record<OpportunityAccessFactKindV1, OpportunityAccessCoverageStateV1>;

  return {
    opportunityId,
    asOf,
    decisionMakers,
    sponsorshipLinks,
    warmAccessPaths,
    planningWindows,
    coverage,
    researchGaps: KIND_ORDER.filter((kind) => coverage[kind] !== "EVIDENCED"),
    withheld,
    verificationRequired: withheld.length > 0
  };
}
