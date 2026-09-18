export const SPONSOR_MAP_QUALIFICATION_VERSION = "SPONSOR_MAP_QUALIFICATION_V1" as const;

export type SponsorMapTruthStateV1 = "KNOWN" | "INFERRED" | "UNKNOWN" | "STALE" | "CONFLICTED" | "PARTIAL";

export type SponsorMapEcosystemRoleV1 =
  | "PROPERTY_SIDE"
  | "SPONSOR_SIDE"
  | "AGENCY_OR_RIGHTSHOLDER"
  | "TALENT_SIDE"
  | "UNKNOWN";

export type SponsorMapDecisionFunctionV1 =
  | "SPONSORSHIP_SALES"
  | "SPONSORSHIP_ACTIVATION"
  | "SPORTS_MARKETING"
  | "BRAND_PARTNERSHIPS"
  | "EXPERIENTIAL"
  | "LICENSING"
  | "COMMUNITY_FOUNDATION"
  | "MARKETING_LEADERSHIP"
  | "UNKNOWN";

export type SponsorMapAuthorityClassV1 =
  | "DECISION_MAKER"
  | "BUDGET_OWNER"
  | "INFLUENCER"
  | "GATEKEEPER"
  | "SALES_OWNER"
  | "UNKNOWN";

export type SponsorMapAccessPathV1 = "DIRECT" | "WARM" | "SECOND_DEGREE" | "COLD" | "UNKNOWN";
export type SponsorMapContactRouteV1 = "PUBLIC_PROFESSIONAL" | "AUTHORIZED" | "UNKNOWN";

export type SponsorMapEvidenceFieldV1<T> = {
  state: SponsorMapTruthStateV1;
  value: T | null;
  evidenceRefs: readonly string[];
};

export type SponsorMapCandidateV1 = {
  candidateId: string;
  sourceRef: string;
  observedAt: string | Date;
  evidenceRefs: readonly string[];
  canonicalOrganizationRef?: string | null;
  canonicalPersonRef?: string | null;
  duplicateKey?: string | null;
  ecosystemRole: SponsorMapEvidenceFieldV1<SponsorMapEcosystemRoleV1>;
  decisionFunction: SponsorMapEvidenceFieldV1<SponsorMapDecisionFunctionV1>;
  authorityClass: SponsorMapEvidenceFieldV1<SponsorMapAuthorityClassV1>;
  accessPath: SponsorMapEvidenceFieldV1<SponsorMapAccessPathV1>;
  contactRoute: SponsorMapEvidenceFieldV1<SponsorMapContactRouteV1>;
  planningWindow: SponsorMapEvidenceFieldV1<string>;
  eventOrSeasonDate?: SponsorMapEvidenceFieldV1<string> | null;
};

export type SponsorMapQualificationInputV1 = {
  candidates: readonly SponsorMapCandidateV1[];
  now: string | Date;
  maximumEvidenceAgeDays?: number;
};

export type SponsorMapDispositionV1 = "QUALIFIED_FOR_GRAPH" | "NEEDS_RESEARCH" | "NEEDS_VERIFICATION" | "SUPPRESS";

export type SponsorMapCoverageGapV1 =
  | "MISSING_CANONICAL_ORGANIZATION"
  | "MISSING_EVIDENCE"
  | "ECOSYSTEM_ROLE_UNKNOWN"
  | "DECISION_FUNCTION_UNKNOWN"
  | "AUTHORITY_UNKNOWN"
  | "ACCESS_PATH_UNKNOWN"
  | "CONTACT_ROUTE_UNKNOWN"
  | "PLANNING_WINDOW_UNKNOWN"
  | "EVIDENCE_INFERRED_OR_PARTIAL"
  | "EVIDENCE_STALE"
  | "EVIDENCE_CONFLICTED";

export type SponsorMapQualificationDecisionV1 = Readonly<{
  candidateId: string;
  disposition: SponsorMapDispositionV1;
  duplicateOfCandidateId: string | null;
  canonicalOrganizationRef: string | null;
  canonicalPersonRef: string | null;
  ecosystemRole: Readonly<SponsorMapEvidenceFieldV1<SponsorMapEcosystemRoleV1>>;
  decisionFunction: Readonly<SponsorMapEvidenceFieldV1<SponsorMapDecisionFunctionV1>>;
  authorityClass: Readonly<SponsorMapEvidenceFieldV1<SponsorMapAuthorityClassV1>>;
  accessPath: Readonly<SponsorMapEvidenceFieldV1<SponsorMapAccessPathV1>>;
  contactRoute: Readonly<SponsorMapEvidenceFieldV1<SponsorMapContactRouteV1>>;
  planningWindow: Readonly<SponsorMapEvidenceFieldV1<string>>;
  eventOrSeasonDate: Readonly<SponsorMapEvidenceFieldV1<string>> | null;
  sourceRef: string;
  observedAt: string;
  evidenceRefs: readonly string[];
  coverageGaps: readonly SponsorMapCoverageGapV1[];
  reasonCodes: readonly string[];
}>;

export type SponsorMapQualificationResultV1 = Readonly<{
  version: typeof SPONSOR_MAP_QUALIFICATION_VERSION;
  generatedAt: string;
  decisions: readonly SponsorMapQualificationDecisionV1[];
  counts: Readonly<{
    reviewed: number;
    qualifiedForGraph: number;
    needsResearch: number;
    needsVerification: number;
    suppressed: number;
  }>;
  externalResearchPerformed: false;
  crmMutationPerformed: false;
  externalActionPerformed: false;
}>;

const DAY_MS = 86_400_000;
const MAX_CANDIDATES = 500;
const DEFAULT_MAX_EVIDENCE_AGE_DAYS = 180;
const TRUTH_STATES = new Set<SponsorMapTruthStateV1>(["KNOWN", "INFERRED", "UNKNOWN", "STALE", "CONFLICTED", "PARTIAL"]);
const ECOSYSTEM_ROLES = new Set<SponsorMapEcosystemRoleV1>([
  "PROPERTY_SIDE",
  "SPONSOR_SIDE",
  "AGENCY_OR_RIGHTSHOLDER",
  "TALENT_SIDE",
  "UNKNOWN"
]);
const DECISION_FUNCTIONS = new Set<SponsorMapDecisionFunctionV1>([
  "SPONSORSHIP_SALES",
  "SPONSORSHIP_ACTIVATION",
  "SPORTS_MARKETING",
  "BRAND_PARTNERSHIPS",
  "EXPERIENTIAL",
  "LICENSING",
  "COMMUNITY_FOUNDATION",
  "MARKETING_LEADERSHIP",
  "UNKNOWN"
]);
const AUTHORITY_CLASSES = new Set<SponsorMapAuthorityClassV1>([
  "DECISION_MAKER",
  "BUDGET_OWNER",
  "INFLUENCER",
  "GATEKEEPER",
  "SALES_OWNER",
  "UNKNOWN"
]);
const ACCESS_PATHS = new Set<SponsorMapAccessPathV1>(["DIRECT", "WARM", "SECOND_DEGREE", "COLD", "UNKNOWN"]);
const CONTACT_ROUTES = new Set<SponsorMapContactRouteV1>(["PUBLIC_PROFESSIONAL", "AUTHORIZED", "UNKNOWN"]);
const GAP_ORDER: readonly SponsorMapCoverageGapV1[] = [
  "MISSING_CANONICAL_ORGANIZATION",
  "MISSING_EVIDENCE",
  "ECOSYSTEM_ROLE_UNKNOWN",
  "DECISION_FUNCTION_UNKNOWN",
  "AUTHORITY_UNKNOWN",
  "ACCESS_PATH_UNKNOWN",
  "CONTACT_ROUTE_UNKNOWN",
  "PLANNING_WINDOW_UNKNOWN",
  "EVIDENCE_CONFLICTED",
  "EVIDENCE_STALE",
  "EVIDENCE_INFERRED_OR_PARTIAL"
];

type NormalizedCandidate = Omit<SponsorMapQualificationDecisionV1, "disposition" | "duplicateOfCandidateId" | "coverageGaps" | "reasonCodes"> & {
  observedAtMs: number;
  duplicateKey: string;
};

function requiredText(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(`${label} must be a non-empty string`);
  return value.trim();
}

function optionalText(value: unknown, label: string): string | null {
  if (value == null) return null;
  return requiredText(value, label);
}

function timestamp(value: string | Date, label: string): string {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error(`${label} must be a valid timestamp`);
  return date.toISOString();
}

function refs(value: readonly string[] | undefined, label: string): readonly string[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  return Object.freeze([...new Set(value.map((item, index) => requiredText(item, `${label}[${index}]`)))].sort((a, b) => a.localeCompare(b)));
}

function boundedInteger(value: unknown, fallback: number, min: number, max: number, label: string): number {
  const candidate = value == null ? fallback : value;
  if (typeof candidate !== "number" || !Number.isInteger(candidate) || candidate < min || candidate > max) {
    throw new Error(`${label} must be an integer between ${min} and ${max}`);
  }
  return candidate;
}

function freezeDeep<T>(value: T): Readonly<T> {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) freezeDeep(child);
    Object.freeze(value);
  }
  return value as Readonly<T>;
}

function normalizeEnumField<T extends string>(
  field: SponsorMapEvidenceFieldV1<T>,
  values: ReadonlySet<T>,
  label: string
): Readonly<SponsorMapEvidenceFieldV1<T>> {
  if (!field || typeof field !== "object" || Array.isArray(field)) throw new Error(`${label} must be an object`);
  if (!TRUTH_STATES.has(field.state)) throw new Error(`${label}.state is unsupported`);
  if (field.value != null && !values.has(field.value)) throw new Error(`${label}.value is unsupported`);
  return freezeDeep({ state: field.state, value: field.value, evidenceRefs: [...refs(field.evidenceRefs, `${label}.evidenceRefs`)] });
}

function normalizeTextField(
  field: SponsorMapEvidenceFieldV1<string> | null | undefined,
  label: string
): Readonly<SponsorMapEvidenceFieldV1<string>> | null {
  if (field == null) return null;
  if (!field || typeof field !== "object" || Array.isArray(field)) throw new Error(`${label} must be an object`);
  if (!TRUTH_STATES.has(field.state)) throw new Error(`${label}.state is unsupported`);
  return freezeDeep({
    state: field.state,
    value: field.value == null ? null : requiredText(field.value, `${label}.value`),
    evidenceRefs: [...refs(field.evidenceRefs, `${label}.evidenceRefs`)]
  });
}

function normalizedDuplicateKey(candidate: SponsorMapCandidateV1): string {
  const supplied = optionalText(candidate.duplicateKey, "duplicateKey");
  return supplied ? supplied.toLocaleLowerCase("en-US") : `candidate:${requiredText(candidate.candidateId, "candidateId").toLocaleLowerCase("en-US")}`;
}

function normalizeCandidate(candidate: SponsorMapCandidateV1, index: number, nowMs: number): NormalizedCandidate {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) throw new Error(`candidate ${index} must be an object`);
  const observedAt = timestamp(candidate.observedAt, `candidate ${index}.observedAt`);
  const observedAtMs = Date.parse(observedAt);
  if (observedAtMs > nowMs) throw new Error(`candidate ${index}.observedAt must not be future-dated`);

  return {
    candidateId: requiredText(candidate.candidateId, `candidate ${index}.candidateId`),
    canonicalOrganizationRef: optionalText(candidate.canonicalOrganizationRef, `candidate ${index}.canonicalOrganizationRef`),
    canonicalPersonRef: optionalText(candidate.canonicalPersonRef, `candidate ${index}.canonicalPersonRef`),
    ecosystemRole: normalizeEnumField(candidate.ecosystemRole, ECOSYSTEM_ROLES, `candidate ${index}.ecosystemRole`),
    decisionFunction: normalizeEnumField(candidate.decisionFunction, DECISION_FUNCTIONS, `candidate ${index}.decisionFunction`),
    authorityClass: normalizeEnumField(candidate.authorityClass, AUTHORITY_CLASSES, `candidate ${index}.authorityClass`),
    accessPath: normalizeEnumField(candidate.accessPath, ACCESS_PATHS, `candidate ${index}.accessPath`),
    contactRoute: normalizeEnumField(candidate.contactRoute, CONTACT_ROUTES, `candidate ${index}.contactRoute`),
    planningWindow: normalizeTextField(candidate.planningWindow, `candidate ${index}.planningWindow`) as Readonly<SponsorMapEvidenceFieldV1<string>>,
    eventOrSeasonDate: normalizeTextField(candidate.eventOrSeasonDate, `candidate ${index}.eventOrSeasonDate`),
    sourceRef: requiredText(candidate.sourceRef, `candidate ${index}.sourceRef`),
    observedAt,
    observedAtMs,
    evidenceRefs: refs(candidate.evidenceRefs, `candidate ${index}.evidenceRefs`),
    duplicateKey: normalizedDuplicateKey(candidate)
  };
}

function allFields(candidate: NormalizedCandidate): readonly Readonly<SponsorMapEvidenceFieldV1<unknown>>[] {
  const fields: Readonly<SponsorMapEvidenceFieldV1<unknown>>[] = [
    candidate.ecosystemRole,
    candidate.decisionFunction,
    candidate.authorityClass,
    candidate.accessPath,
    candidate.contactRoute,
    candidate.planningWindow
  ];
  if (candidate.eventOrSeasonDate) fields.push(candidate.eventOrSeasonDate);
  return fields;
}

function coverageGaps(candidate: NormalizedCandidate, nowMs: number, maximumEvidenceAgeDays: number): SponsorMapCoverageGapV1[] {
  const gaps = new Set<SponsorMapCoverageGapV1>();
  if (!candidate.canonicalOrganizationRef) gaps.add("MISSING_CANONICAL_ORGANIZATION");
  if (candidate.evidenceRefs.length === 0) gaps.add("MISSING_EVIDENCE");
  if (candidate.ecosystemRole.value == null || candidate.ecosystemRole.value === "UNKNOWN") gaps.add("ECOSYSTEM_ROLE_UNKNOWN");
  if (candidate.decisionFunction.value == null || candidate.decisionFunction.value === "UNKNOWN") gaps.add("DECISION_FUNCTION_UNKNOWN");
  if (candidate.authorityClass.value == null || candidate.authorityClass.value === "UNKNOWN") gaps.add("AUTHORITY_UNKNOWN");
  if (candidate.accessPath.value == null || candidate.accessPath.value === "UNKNOWN") gaps.add("ACCESS_PATH_UNKNOWN");
  if (candidate.contactRoute.value == null || candidate.contactRoute.value === "UNKNOWN") gaps.add("CONTACT_ROUTE_UNKNOWN");
  if (candidate.planningWindow.value == null || candidate.planningWindow.state === "UNKNOWN") gaps.add("PLANNING_WINDOW_UNKNOWN");

  const fields = allFields(candidate);
  if (fields.some((field) => field.state === "CONFLICTED")) gaps.add("EVIDENCE_CONFLICTED");
  if (fields.some((field) => field.state === "STALE") || nowMs - candidate.observedAtMs > maximumEvidenceAgeDays * DAY_MS) gaps.add("EVIDENCE_STALE");
  if (fields.some((field) => field.state === "INFERRED" || field.state === "PARTIAL")) gaps.add("EVIDENCE_INFERRED_OR_PARTIAL");
  return GAP_ORDER.filter((gap) => gaps.has(gap));
}

function dispositionFor(gaps: readonly SponsorMapCoverageGapV1[]): SponsorMapDispositionV1 {
  if (gaps.includes("MISSING_CANONICAL_ORGANIZATION") || gaps.includes("MISSING_EVIDENCE")) return "SUPPRESS";
  if (gaps.includes("EVIDENCE_CONFLICTED") || gaps.includes("EVIDENCE_STALE") || gaps.includes("EVIDENCE_INFERRED_OR_PARTIAL")) {
    return "NEEDS_VERIFICATION";
  }
  if (gaps.length > 0) return "NEEDS_RESEARCH";
  return "QUALIFIED_FOR_GRAPH";
}

function reasonCodes(disposition: SponsorMapDispositionV1, gaps: readonly SponsorMapCoverageGapV1[]): readonly string[] {
  if (disposition === "QUALIFIED_FOR_GRAPH") return ["EVIDENCE_COMPLETE_FOR_SPONSOR_MAP_CANDIDATE"];
  return gaps.length > 0 ? gaps : ["NO_QUALIFICATION_REASON_AVAILABLE"];
}

export function qualifySponsorMapCandidatesV1(input: SponsorMapQualificationInputV1): SponsorMapQualificationResultV1 {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("input must be an object");
  if (!Array.isArray(input.candidates)) throw new Error("candidates must be an array");
  if (input.candidates.length > MAX_CANDIDATES) throw new Error(`candidates exceeds ${MAX_CANDIDATES}`);
  const generatedAt = timestamp(input.now, "now");
  const nowMs = Date.parse(generatedAt);
  const maximumEvidenceAgeDays = boundedInteger(input.maximumEvidenceAgeDays, DEFAULT_MAX_EVIDENCE_AGE_DAYS, 1, 3650, "maximumEvidenceAgeDays");
  const normalized = input.candidates.map((candidate, index) => normalizeCandidate(candidate, index, nowMs));

  const canonicalByDuplicateKey = new Map<string, NormalizedCandidate>();
  for (const candidate of [...normalized].sort((a, b) => b.observedAtMs - a.observedAtMs || a.candidateId.localeCompare(b.candidateId))) {
    if (!canonicalByDuplicateKey.has(candidate.duplicateKey)) canonicalByDuplicateKey.set(candidate.duplicateKey, candidate);
  }

  const decisions = normalized
    .map((candidate): SponsorMapQualificationDecisionV1 => {
      const canonical = canonicalByDuplicateKey.get(candidate.duplicateKey);
      if (canonical && canonical.candidateId !== candidate.candidateId) {
        return freezeDeep({
          ...candidate,
          disposition: "SUPPRESS" as const,
          duplicateOfCandidateId: canonical.candidateId,
          coverageGaps: [] as SponsorMapCoverageGapV1[],
          reasonCodes: ["DUPLICATE_SOURCE_COPY"],
          observedAtMs: undefined,
          duplicateKey: undefined
        } as unknown as SponsorMapQualificationDecisionV1);
      }
      const gaps = coverageGaps(candidate, nowMs, maximumEvidenceAgeDays);
      const disposition = dispositionFor(gaps);
      const {
        observedAtMs: _observedAtMs,
        duplicateKey: _duplicateKey,
        ...publicCandidate
      } = candidate;
      return freezeDeep({
        ...publicCandidate,
        disposition,
        duplicateOfCandidateId: null,
        coverageGaps: [...gaps],
        reasonCodes: [...reasonCodes(disposition, gaps)]
      });
    })
    .sort((a, b) => a.candidateId.localeCompare(b.candidateId));

  const counts = {
    reviewed: decisions.length,
    qualifiedForGraph: decisions.filter((item) => item.disposition === "QUALIFIED_FOR_GRAPH").length,
    needsResearch: decisions.filter((item) => item.disposition === "NEEDS_RESEARCH").length,
    needsVerification: decisions.filter((item) => item.disposition === "NEEDS_VERIFICATION").length,
    suppressed: decisions.filter((item) => item.disposition === "SUPPRESS").length
  };

  return freezeDeep({
    version: SPONSOR_MAP_QUALIFICATION_VERSION,
    generatedAt,
    decisions,
    counts,
    externalResearchPerformed: false as const,
    crmMutationPerformed: false as const,
    externalActionPerformed: false as const
  });
}
