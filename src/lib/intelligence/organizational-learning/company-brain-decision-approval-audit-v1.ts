import { createHash } from "node:crypto";

import {
  DECISION_MEMORY_BRIEF_POLICY_VERSION_V1,
  type DecisionMemoryBriefV1
} from "./decision-memory-brief-v1";

export const COMPANY_BRAIN_DECISION_APPROVAL_AUDIT_VERSION_V1 =
  "CompanyBrainDecisionApprovalAuditV1" as const;
export const COMPANY_BRAIN_DECISION_APPROVAL_AUDIT_POLICY_VERSION_V1 =
  "company_brain_decision_approval_audit_v1.0.0" as const;

const MAX_BRIEFS = 500;
const MAX_REFS = 2_000;

export type CompanyBrainDecisionApprovalRecordStateV1 =
  | "NOT_REQUIRED"
  | "PENDING"
  | "APPROVED"
  | "REJECTED"
  | "UNKNOWN";

export type CompanyBrainDecisionApprovalAuditItemV1 = Readonly<{
  sourceBriefId: string;
  decisionId: string;
  decisionClass: DecisionMemoryBriefV1["decisionClass"];
  decidedAt: string;
  sourceGeneratedAt: string;
  sourceAgeMs: number;
  sourceState: DecisionMemoryBriefV1["state"];
  authorityClass: string;
  approvalState: DecisionMemoryBriefV1["approval"]["approvalState"];
  approvalRecordState: CompanyBrainDecisionApprovalRecordStateV1;
  approvedByRef: string | null;
  approvedAt: string | null;
  approvalEvidenceRefs: readonly string[];
  causalInterpretation: "NOT_ESTABLISHED";
  confidence: "NOT_ESTABLISHED";
  monetaryValue: null;
}>;

export type CompanyBrainDecisionApprovalAuditV1 = Readonly<{
  contractVersion: typeof COMPANY_BRAIN_DECISION_APPROVAL_AUDIT_VERSION_V1;
  policyVersion: typeof COMPANY_BRAIN_DECISION_APPROVAL_AUDIT_POLICY_VERSION_V1;
  auditId: string;
  state: "READY" | "VERIFY_SOURCE";
  generatedAt: string;
  maximumSourceAgeMs: number;
  verificationReasons: readonly string[];
  rejectedDecisionIds: readonly string[];
  timeline: readonly CompanyBrainDecisionApprovalAuditItemV1[];
  approved: readonly CompanyBrainDecisionApprovalAuditItemV1[];
  rejected: readonly CompanyBrainDecisionApprovalAuditItemV1[];
  pending: readonly CompanyBrainDecisionApprovalAuditItemV1[];
  notRequired: readonly CompanyBrainDecisionApprovalAuditItemV1[];
  unknown: readonly CompanyBrainDecisionApprovalAuditItemV1[];
  summary: Readonly<{
    supplied: number;
    accepted: number;
    rejectedSources: number;
    approved: number;
    rejected: number;
    pending: number;
    notRequired: number;
    unknown: number;
  }>;
  evidenceRefs: readonly string[];
  sourceDecisionIds: readonly string[];
  causalInterpretation: "NOT_ESTABLISHED";
  confidence: "NOT_ESTABLISHED";
  monetaryValue: null;
  inferredOutcome: null;
  limitations: readonly string[];
  authority: Readonly<{
    analysisOnly: true;
    persistenceAuthorized: false;
    decisionMutationAuthorized: false;
    approvalMutationAuthorized: false;
    portfolioMutationAuthorized: false;
    reallocationAuthorized: false;
    pricingChangeAuthorized: false;
    negotiationActionAuthorized: false;
    campaignExecutionAuthorized: false;
    experimentExecutionAuthorized: false;
    externalActionAuthorized: false;
    approvalBypassAuthorized: false;
  }>;
}>;

export type CompanyBrainDecisionApprovalAuditInputV1 = Readonly<{
  briefs: readonly DecisionMemoryBriefV1[];
  generatedAt: string;
  maximumSourceAgeMs: number;
}>;

const SOURCE_AUTHORITY = Object.freeze({
  analysisOnly: true,
  persistenceAuthorized: false,
  externalActionAuthorized: false,
  pricingChangeAuthorized: false,
  negotiationAuthorized: false,
  spendAuthorized: false,
  publishAuthorized: false,
  approvalBypassAuthorized: false
});

const AUTHORITY = Object.freeze({
  analysisOnly: true as const,
  persistenceAuthorized: false as const,
  decisionMutationAuthorized: false as const,
  approvalMutationAuthorized: false as const,
  portfolioMutationAuthorized: false as const,
  reallocationAuthorized: false as const,
  pricingChangeAuthorized: false as const,
  negotiationActionAuthorized: false as const,
  campaignExecutionAuthorized: false as const,
  experimentExecutionAuthorized: false as const,
  externalActionAuthorized: false as const,
  approvalBypassAuthorized: false as const
});

const LIMITATIONS = Object.freeze([
  "This audit is a read-only projection of canonical DecisionMemoryBriefV1 approval records. It does not create, approve, reject, or mutate a decision.",
  "An approver reference is surfaced only when the canonical source records it with coherent approval timing and evidence provenance. Missing or contradictory approval provenance fails closed.",
  "APPROVED and REJECTED describe the recorded approval state only. They do not establish that the business outcome was good or bad, that the decision should be repeated, or that the approver caused an outcome.",
  "REQUIRED means approval remains pending in the source record. UNKNOWN is preserved as unknown rather than converted into an implicit approval or rejection.",
  "No confidence, causality, monetary value, portfolio change, price change, negotiation action, execution, external action, or approval bypass is authorized."
] as const);

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function canonicalTimestamp(value: unknown): string | null {
  const normalized = text(value);
  if (!normalized) return null;
  const millis = Date.parse(normalized);
  if (!Number.isFinite(millis)) return null;
  return new Date(millis).toISOString() === normalized ? normalized : null;
}

function positiveFinite(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

function uniqueStrings(value: unknown, maximum = MAX_REFS): readonly string[] | null {
  if (!Array.isArray(value) || value.length > maximum) return null;
  const normalized: string[] = [];
  for (const entry of value) {
    const parsed = text(entry);
    if (!parsed) return null;
    normalized.push(parsed);
  }
  if (new Set(normalized).size !== normalized.length) return null;
  return Object.freeze([...normalized].sort((a, b) => a.localeCompare(b)));
}

function exactAuthority(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const actual = value as Record<string, unknown>;
  const expected = SOURCE_AUTHORITY as Record<string, boolean>;
  const actualKeys = Object.keys(actual).sort((a, b) => a.localeCompare(b));
  const expectedKeys = Object.keys(expected).sort((a, b) => a.localeCompare(b));
  return actualKeys.length === expectedKeys.length
    && actualKeys.every((key, index) => key === expectedKeys[index] && actual[key] === expected[key]);
}

function stableId(parts: readonly string[]): string {
  return `company-brain-decision-approval-audit:${createHash("sha256")
    .update(parts.join("\u0000"))
    .digest("hex")
    .slice(0, 20)}`;
}

function deepFreeze<T>(value: T): Readonly<T> {
  if (value && typeof value === "object") {
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
    if (!Object.isFrozen(value)) Object.freeze(value);
  }
  return value as Readonly<T>;
}

function recordState(
  approvalState: DecisionMemoryBriefV1["approval"]["approvalState"]
): CompanyBrainDecisionApprovalRecordStateV1 {
  switch (approvalState) {
    case "NOT_REQUIRED": return "NOT_REQUIRED";
    case "REQUIRED": return "PENDING";
    case "APPROVED": return "APPROVED";
    case "REJECTED": return "REJECTED";
    case "UNKNOWN": return "UNKNOWN";
  }
}

function validateApprovalShape(
  brief: DecisionMemoryBriefV1,
  decisionId: string,
  decidedAtMs: number,
  sourceGeneratedAtMs: number,
  provenanceRefs: readonly string[],
  verificationReasons: Set<string>
): {
  authorityClass: string;
  approvedByRef: string | null;
  approvedAt: string | null;
  approvalEvidenceRefs: readonly string[];
} | null {
  const authorityClass = text(brief.approval?.authorityClass);
  if (!authorityClass) {
    verificationReasons.add(`APPROVAL_AUTHORITY_CLASS_MISSING:${decisionId}`);
    return null;
  }
  if (!new Set(["NOT_REQUIRED", "REQUIRED", "APPROVED", "REJECTED", "UNKNOWN"]).has(brief.approval?.approvalState)) {
    verificationReasons.add(`APPROVAL_STATE_INVALID:${decisionId}`);
    return null;
  }
  const approvalEvidenceRefs = uniqueStrings(brief.approval?.evidenceRefs);
  if (!approvalEvidenceRefs) {
    verificationReasons.add(`APPROVAL_EVIDENCE_INVALID:${decisionId}`);
    return null;
  }
  const provenance = new Set(provenanceRefs);
  if (approvalEvidenceRefs.some((ref) => !provenance.has(ref))) {
    verificationReasons.add(`APPROVAL_EVIDENCE_NOT_IN_PROVENANCE:${decisionId}`);
    return null;
  }

  const approvedByRef = brief.approval.approvedByRef == null
    ? null
    : text(brief.approval.approvedByRef);
  if (brief.approval.approvedByRef != null && !approvedByRef) {
    verificationReasons.add(`APPROVER_REF_INVALID:${decisionId}`);
    return null;
  }
  const approvedAt = brief.approval.approvedAt == null
    ? null
    : canonicalTimestamp(brief.approval.approvedAt);
  if (brief.approval.approvedAt != null && !approvedAt) {
    verificationReasons.add(`APPROVAL_TIMESTAMP_INVALID:${decisionId}`);
    return null;
  }

  const finalState = brief.approval.approvalState === "APPROVED"
    || brief.approval.approvalState === "REJECTED";
  if (finalState) {
    if (!approvedByRef || !approvedAt || approvalEvidenceRefs.length === 0) {
      verificationReasons.add(`FINAL_APPROVAL_PROVENANCE_INCOMPLETE:${decisionId}`);
      return null;
    }
    const approvedAtMs = Date.parse(approvedAt);
    if (approvedAtMs < decidedAtMs || approvedAtMs > sourceGeneratedAtMs) {
      verificationReasons.add(`APPROVAL_CHRONOLOGY_INVALID:${decisionId}`);
      return null;
    }
  } else if (approvedByRef != null || approvedAt != null) {
    verificationReasons.add(`NONFINAL_APPROVAL_HAS_APPROVER:${decisionId}`);
    return null;
  }

  if (brief.integrityFlags.includes("APPROVAL_EVIDENCE_MISSING")) {
    verificationReasons.add(`SOURCE_APPROVAL_INTEGRITY_FLAG:${decisionId}`);
    return null;
  }

  return { authorityClass, approvedByRef, approvedAt, approvalEvidenceRefs };
}

function projectBrief(
  brief: DecisionMemoryBriefV1,
  generatedAtMs: number,
  maximumSourceAgeMs: number,
  verificationReasons: Set<string>
): CompanyBrainDecisionApprovalAuditItemV1 | null {
  const sourceBriefId = text(brief?.briefId);
  const decisionId = text(brief?.decisionId);
  if (!sourceBriefId || !decisionId) {
    verificationReasons.add("SOURCE_ID_MISSING");
    return null;
  }
  if (
    brief.contractVersion !== "DecisionMemoryBriefV1"
    || brief.policyVersion !== DECISION_MEMORY_BRIEF_POLICY_VERSION_V1
  ) {
    verificationReasons.add(`SOURCE_CONTRACT_INVALID:${decisionId}`);
    return null;
  }
  if (!exactAuthority(brief.actionAuthority)) {
    verificationReasons.add(`SOURCE_AUTHORITY_WIDENED:${decisionId}`);
    return null;
  }
  if (brief.state === "VERIFY_INTEGRITY" || brief.state === "VERIFY_LINEAGE") {
    verificationReasons.add(`SOURCE_DECISION_MEMORY_UNVERIFIED:${decisionId}`);
    return null;
  }
  if (!Array.isArray(brief.integrityFlags)) {
    verificationReasons.add(`SOURCE_INTEGRITY_FLAGS_INVALID:${decisionId}`);
    return null;
  }

  const sourceGeneratedAt = canonicalTimestamp(brief.generatedAt);
  const decidedAt = canonicalTimestamp(brief.decidedAt);
  if (!sourceGeneratedAt || !decidedAt) {
    verificationReasons.add(`SOURCE_TIMESTAMP_INVALID:${decisionId}`);
    return null;
  }
  const sourceGeneratedAtMs = Date.parse(sourceGeneratedAt);
  const decidedAtMs = Date.parse(decidedAt);
  if (sourceGeneratedAtMs > generatedAtMs || decidedAtMs > sourceGeneratedAtMs) {
    verificationReasons.add(`SOURCE_CHRONOLOGY_INVALID:${decisionId}`);
    return null;
  }
  const sourceAgeMs = generatedAtMs - sourceGeneratedAtMs;
  if (sourceAgeMs > maximumSourceAgeMs) {
    verificationReasons.add(`SOURCE_BRIEF_STALE:${decisionId}`);
    return null;
  }

  const provenanceRefs = uniqueStrings(brief.provenanceRefs);
  if (!provenanceRefs) {
    verificationReasons.add(`SOURCE_PROVENANCE_INVALID:${decisionId}`);
    return null;
  }
  const approval = validateApprovalShape(
    brief,
    decisionId,
    decidedAtMs,
    sourceGeneratedAtMs,
    provenanceRefs,
    verificationReasons
  );
  if (!approval) return null;

  return deepFreeze({
    sourceBriefId,
    decisionId,
    decisionClass: brief.decisionClass,
    decidedAt,
    sourceGeneratedAt,
    sourceAgeMs,
    sourceState: brief.state,
    authorityClass: approval.authorityClass,
    approvalState: brief.approval.approvalState,
    approvalRecordState: recordState(brief.approval.approvalState),
    approvedByRef: approval.approvedByRef,
    approvedAt: approval.approvedAt,
    approvalEvidenceRefs: approval.approvalEvidenceRefs,
    causalInterpretation: "NOT_ESTABLISHED" as const,
    confidence: "NOT_ESTABLISHED" as const,
    monetaryValue: null
  }) as CompanyBrainDecisionApprovalAuditItemV1;
}

function timelineSort(
  left: CompanyBrainDecisionApprovalAuditItemV1,
  right: CompanyBrainDecisionApprovalAuditItemV1
): number {
  const timeDelta = Date.parse(right.decidedAt) - Date.parse(left.decidedAt);
  return timeDelta !== 0 ? timeDelta : left.decisionId.localeCompare(right.decisionId);
}

export function compileCompanyBrainDecisionApprovalAuditV1(
  input: CompanyBrainDecisionApprovalAuditInputV1
): CompanyBrainDecisionApprovalAuditV1 {
  const generatedAt = canonicalTimestamp(input?.generatedAt);
  if (!generatedAt) throw new Error("COMPANY_BRAIN_DECISION_APPROVAL_AUDIT_INVALID_GENERATED_AT");
  const generatedAtMs = Date.parse(generatedAt);
  const maximumSourceAgeMs = positiveFinite(input?.maximumSourceAgeMs);
  if (maximumSourceAgeMs == null) {
    throw new Error("COMPANY_BRAIN_DECISION_APPROVAL_AUDIT_INVALID_SOURCE_AGE_POLICY");
  }
  if (!Array.isArray(input?.briefs) || input.briefs.length > MAX_BRIEFS) {
    throw new Error("COMPANY_BRAIN_DECISION_APPROVAL_AUDIT_INVALID_BRIEF_SET");
  }

  const verificationReasons = new Set<string>();
  const duplicateDecisionIds = new Set<string>();
  const duplicateBriefIds = new Set<string>();
  const decisionCounts = new Map<string, number>();
  const briefCounts = new Map<string, number>();
  for (const brief of input.briefs) {
    const decisionId = text(brief?.decisionId);
    const briefId = text(brief?.briefId);
    if (decisionId) decisionCounts.set(decisionId, (decisionCounts.get(decisionId) ?? 0) + 1);
    if (briefId) briefCounts.set(briefId, (briefCounts.get(briefId) ?? 0) + 1);
  }
  for (const [decisionId, count] of decisionCounts) {
    if (count > 1) {
      duplicateDecisionIds.add(decisionId);
      verificationReasons.add(`DUPLICATE_DECISION_ID:${decisionId}`);
    }
  }
  for (const [briefId, count] of briefCounts) {
    if (count > 1) {
      duplicateBriefIds.add(briefId);
      verificationReasons.add(`DUPLICATE_SOURCE_BRIEF_ID:${briefId}`);
    }
  }

  const accepted: CompanyBrainDecisionApprovalAuditItemV1[] = [];
  const rejectedDecisionIds = new Set<string>();
  for (const brief of input.briefs) {
    const decisionId = text(brief?.decisionId);
    const briefId = text(brief?.briefId);
    if (
      (decisionId && duplicateDecisionIds.has(decisionId))
      || (briefId && duplicateBriefIds.has(briefId))
    ) {
      if (decisionId) rejectedDecisionIds.add(decisionId);
      continue;
    }
    const projected = projectBrief(brief, generatedAtMs, maximumSourceAgeMs, verificationReasons);
    if (projected) accepted.push(projected);
    else if (decisionId) rejectedDecisionIds.add(decisionId);
  }

  const timeline = Object.freeze([...accepted].sort(timelineSort));
  const approved = Object.freeze(timeline.filter((item) => item.approvalRecordState === "APPROVED"));
  const rejected = Object.freeze(timeline.filter((item) => item.approvalRecordState === "REJECTED"));
  const pending = Object.freeze(timeline.filter((item) => item.approvalRecordState === "PENDING"));
  const notRequired = Object.freeze(timeline.filter((item) => item.approvalRecordState === "NOT_REQUIRED"));
  const unknown = Object.freeze(timeline.filter((item) => item.approvalRecordState === "UNKNOWN"));
  const evidenceRefs = Object.freeze(
    [...new Set(timeline.flatMap((item) => item.approvalEvidenceRefs))].sort((a, b) => a.localeCompare(b))
  );
  const sourceDecisionIds = Object.freeze(
    [...new Set(timeline.map((item) => item.decisionId))].sort((a, b) => a.localeCompare(b))
  );
  const reasons = Object.freeze([...verificationReasons].sort((a, b) => a.localeCompare(b)));
  const rejectedIds = Object.freeze([...rejectedDecisionIds].sort((a, b) => a.localeCompare(b)));

  const output: CompanyBrainDecisionApprovalAuditV1 = {
    contractVersion: COMPANY_BRAIN_DECISION_APPROVAL_AUDIT_VERSION_V1,
    policyVersion: COMPANY_BRAIN_DECISION_APPROVAL_AUDIT_POLICY_VERSION_V1,
    auditId: stableId([
      generatedAt,
      String(maximumSourceAgeMs),
      ...sourceDecisionIds,
      ...timeline.map((item) => item.sourceBriefId),
      ...reasons
    ]),
    state: reasons.length === 0 ? "READY" : "VERIFY_SOURCE",
    generatedAt,
    maximumSourceAgeMs,
    verificationReasons: reasons,
    rejectedDecisionIds: rejectedIds,
    timeline,
    approved,
    rejected,
    pending,
    notRequired,
    unknown,
    summary: Object.freeze({
      supplied: input.briefs.length,
      accepted: timeline.length,
      rejectedSources: input.briefs.length - timeline.length,
      approved: approved.length,
      rejected: rejected.length,
      pending: pending.length,
      notRequired: notRequired.length,
      unknown: unknown.length
    }),
    evidenceRefs,
    sourceDecisionIds,
    causalInterpretation: "NOT_ESTABLISHED",
    confidence: "NOT_ESTABLISHED",
    monetaryValue: null,
    inferredOutcome: null,
    limitations: LIMITATIONS,
    authority: AUTHORITY
  };

  return deepFreeze(output) as CompanyBrainDecisionApprovalAuditV1;
}
