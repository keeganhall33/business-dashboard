import type { ClaimVersionLite, OpportunityGraphLinkDraft, OpportunityRowLite } from "./types";
import { clamp01, normalizeIdentity } from "./normalize";
import { extractExplicitGraphRefs } from "./extract";

type ParsedClaimSubject = {
  canonicalName: string | null;
  canonicalId: string | null;
};

type ParsedClaim = {
  predicate: string | null;
  subject: ParsedClaimSubject;
};

function parseClaimPayload(payload: unknown): ParsedClaim {
  if (!payload || typeof payload !== "object") {
    return { predicate: null, subject: { canonicalName: null, canonicalId: null } };
  }
  const p = payload as Record<string, unknown>;
  const predicate = typeof p.predicate === "string" ? p.predicate : typeof p.p === "string" ? p.p : null;
  const subjectRaw = (p.subject ?? p.s) as unknown;

  const subject: ParsedClaimSubject = { canonicalName: null, canonicalId: null };
  if (typeof subjectRaw === "string") {
    subject.canonicalName = subjectRaw;
  } else if (subjectRaw && typeof subjectRaw === "object") {
    const s = subjectRaw as Record<string, unknown>;
    if (typeof s.canonical_name === "string") subject.canonicalName = s.canonical_name;
    if (typeof s.canonicalName === "string") subject.canonicalName = s.canonicalName;
    if (typeof s.canonical_id === "string") subject.canonicalId = s.canonical_id;
    if (typeof s.canonicalId === "string") subject.canonicalId = s.canonicalId;
    if (typeof s.id === "string" && !subject.canonicalId) subject.canonicalId = s.id;
  }

  return { predicate, subject };
}

function buildUnambiguousSubjectIndex(claims: ClaimVersionLite[]) {
  // For a given normalized subject name, only allow linking if we can prove a single canonicalId.
  const map = new Map<string, { canonicalIds: Set<string>; anyRows: ClaimVersionLite[] }>();
  for (const row of claims) {
    const parsed = parseClaimPayload(row.payload_json);
    const key = normalizeIdentity(parsed.subject.canonicalName) ?? null;
    if (!key) continue;
    const entry = map.get(key) ?? { canonicalIds: new Set<string>(), anyRows: [] };
    if (parsed.subject.canonicalId) entry.canonicalIds.add(parsed.subject.canonicalId);
    entry.anyRows.push(row);
    map.set(key, entry);
  }
  return map;
}

export function linkOpportunityToGraph(params: {
  opportunity: OpportunityRowLite;
  claimVersions: ClaimVersionLite[];
  allowedPredicates?: string[];
}): OpportunityGraphLinkDraft[] {
  const allowed = new Set(params.allowedPredicates ?? ["operates_event_program", "has_program_surface"]);
  const orgKey = normalizeIdentity(params.opportunity.organization) ?? null;
  const nameKey = normalizeIdentity(params.opportunity.name) ?? null;
  const subjectIndex = buildUnambiguousSubjectIndex(params.claimVersions);

  const links: OpportunityGraphLinkDraft[] = [];
  const seen = new Set<string>();
  const push = (link: OpportunityGraphLinkDraft) => {
    const key = `${link.opportunity_id}|${link.target_type}|${link.target_id}|${link.target_content_hash ?? ""}|${link.role}|${link.match_method}`;
    if (seen.has(key)) return;
    seen.add(key);
    links.push(link);
  };

  // 1) Explicit refs in notes/source.
  const explicit = extractExplicitGraphRefs([params.opportunity.notes_md, params.opportunity.source].filter(Boolean).join("\n"));
  for (const ref of explicit) {
    if (ref.kind === "claim") {
      push({
        opportunity_id: params.opportunity.id,
        target_type: "claim_version",
        target_id: ref.claimId,
        target_content_hash: ref.contentHash ?? null,
        role: "CONTEXT_FOR",
        match_method: "explicit_id",
        confidence: 1,
        explanation: "Explicit claim id reference found in opportunity notes/source.",
        metadata: { source: "notes_md/source" }
      });
    }
    if (ref.kind === "event") {
      push({
        opportunity_id: params.opportunity.id,
        target_type: "event_version",
        target_id: ref.eventId,
        target_content_hash: ref.contentHash ?? null,
        role: "TIMING_SIGNAL",
        match_method: "explicit_id",
        confidence: 1,
        explanation: "Explicit event id reference found in opportunity notes/source.",
        metadata: { source: "notes_md/source" }
      });
    }
    if (ref.kind === "signal") {
      push({
        opportunity_id: params.opportunity.id,
        target_type: "signal_version",
        target_id: ref.signalId,
        target_content_hash: ref.contentHash ?? null,
        role: "TRIGGERED_BY",
        match_method: "explicit_id",
        confidence: 1,
        explanation: "Explicit signal id reference found in opportunity notes/source.",
        metadata: { source: "notes_md/source" }
      });
    }
    if (ref.kind === "evidence") {
      push({
        opportunity_id: params.opportunity.id,
        target_type: "evidence_reference_version",
        target_id: ref.evidenceReferenceId,
        target_content_hash: ref.contentHash ?? null,
        role: "SUPPORTS",
        match_method: "explicit_id",
        confidence: 1,
        explanation: "Explicit evidence reference found in opportunity notes/source.",
        metadata: { source: "notes_md/source" }
      });
    }
  }

  // 2) Canonical entity id (if opportunity already had it; v1 opportunity table does not, so nothing here).
  // Reserved for future expansion.

  // 4) Exact normalized organization name → unambiguous claim subject.
  if (orgKey) {
    const entry = subjectIndex.get(orgKey);
    const canLink = entry && (entry.canonicalIds.size <= 1);
    if (canLink) {
      for (const row of entry!.anyRows) {
        const parsed = parseClaimPayload(row.payload_json);
        if (!parsed.predicate || !allowed.has(parsed.predicate)) continue;
        push({
          opportunity_id: params.opportunity.id,
          target_type: "claim_version",
          target_id: row.claim_id,
          target_content_hash: row.content_hash,
          role: parsed.predicate === "operates_event_program" ? "CONTEXT_FOR" : "SUPPORTS",
          match_method: "exact_org_name",
          confidence: clamp01(0.75),
          explanation: `Linked by exact normalized organization match to claim subject (${parsed.subject.canonicalName ?? "unknown"}).`,
          metadata: { predicate: parsed.predicate, org_key: orgKey }
        });
      }
    }
  }

  // 5) Constrained alias match: allow opportunity name to equal subject name only when unambiguous.
  if (!orgKey && nameKey) {
    const entry = subjectIndex.get(nameKey);
    const canLink = entry && (entry.canonicalIds.size <= 1);
    if (canLink) {
      for (const row of entry!.anyRows) {
        const parsed = parseClaimPayload(row.payload_json);
        if (!parsed.predicate || !allowed.has(parsed.predicate)) continue;
        push({
          opportunity_id: params.opportunity.id,
          target_type: "claim_version",
          target_id: row.claim_id,
          target_content_hash: row.content_hash,
          role: "CONTEXT_FOR",
          match_method: "alias_unambiguous",
          confidence: clamp01(0.6),
          explanation: `Linked by unambiguous alias match between opportunity name and claim subject (${parsed.subject.canonicalName ?? "unknown"}).`,
          metadata: { predicate: parsed.predicate, name_key: nameKey }
        });
      }
    }
  }

  return links;
}

