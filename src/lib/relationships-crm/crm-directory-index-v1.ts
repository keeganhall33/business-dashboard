export type CrmDirectoryEvidenceStateV1 = "KNOWN" | "UNKNOWN" | "STALE" | "CONFLICTED";
export type CrmRelationshipStrengthV1 = "HIGH" | "MEDIUM" | "LOW" | "UNKNOWN";
export type CrmContactChannelKindV1 = "EMAIL" | "PHONE" | "LINKEDIN" | "OTHER";

export type CrmContactChannelV1 = {
  kind: CrmContactChannelKindV1;
  value: string | null;
  evidenceState: CrmDirectoryEvidenceStateV1;
};

export type CrmPersonDirectoryRecordV1 = {
  id: string;
  name: string | null;
  title: string | null;
  companyName: string | null;
  contactChannels: readonly CrmContactChannelV1[];
  relationshipState: string | null;
  relationshipStrength: CrmRelationshipStrengthV1;
  lastTouchAt: string | null;
  nextFollowUpAt: string | null;
  activeOpportunity: string | null;
  activeAsk: string | null;
  evidenceState: CrmDirectoryEvidenceStateV1;
};

export type CrmCompanyDirectoryRecordV1 = {
  id: string;
  name: string | null;
  category: string | null;
  keyPeople: readonly string[];
  relationshipState: string | null;
  activeOpportunities: readonly string[];
  lastActivityAt: string | null;
  nextMove: string | null;
  supportedValue: string | null;
  evidenceState: CrmDirectoryEvidenceStateV1;
};

export type CrmDirectoryIndexV1 = {
  people: readonly CrmPersonDirectoryRecordV1[];
  companies: readonly CrmCompanyDirectoryRecordV1[];
};

export type CrmDirectoryFilterV1 = {
  query?: string | null;
  evidenceStates?: readonly CrmDirectoryEvidenceStateV1[] | null;
};

const EVIDENCE_ORDER: Record<CrmDirectoryEvidenceStateV1, number> = {
  KNOWN: 0,
  STALE: 1,
  UNKNOWN: 2,
  CONFLICTED: 3
};

function normalizedText(value: string | null): string {
  return value?.trim().toLocaleLowerCase("en-US") ?? "";
}

function compareNullableLabel(left: string | null, right: string | null): number {
  if (left == null && right == null) return 0;
  if (left == null) return 1;
  if (right == null) return -1;
  return left.localeCompare(right, "en-US", { sensitivity: "base" });
}

function matchesEvidence(
  state: CrmDirectoryEvidenceStateV1,
  filter: CrmDirectoryFilterV1
): boolean {
  const states = filter.evidenceStates;
  return !states?.length || states.includes(state);
}

function matchesQuery(values: readonly (string | null)[], filter: CrmDirectoryFilterV1): boolean {
  const query = normalizedText(filter.query ?? null);
  return !query || values.some((value) => normalizedText(value).includes(query));
}

export function sortCrmPeopleV1(
  people: readonly CrmPersonDirectoryRecordV1[]
): readonly CrmPersonDirectoryRecordV1[] {
  return [...people].sort((left, right) =>
    compareNullableLabel(left.name, right.name) ||
    compareNullableLabel(left.companyName, right.companyName) ||
    EVIDENCE_ORDER[left.evidenceState] - EVIDENCE_ORDER[right.evidenceState] ||
    left.id.localeCompare(right.id)
  );
}

export function sortCrmCompaniesV1(
  companies: readonly CrmCompanyDirectoryRecordV1[]
): readonly CrmCompanyDirectoryRecordV1[] {
  return [...companies].sort((left, right) =>
    compareNullableLabel(left.name, right.name) ||
    EVIDENCE_ORDER[left.evidenceState] - EVIDENCE_ORDER[right.evidenceState] ||
    left.id.localeCompare(right.id)
  );
}

export function filterCrmPeopleV1(
  people: readonly CrmPersonDirectoryRecordV1[],
  filter: CrmDirectoryFilterV1 = {}
): readonly CrmPersonDirectoryRecordV1[] {
  return sortCrmPeopleV1(people).filter((person) =>
    matchesEvidence(person.evidenceState, filter) &&
    matchesQuery(
      [
        person.name,
        person.title,
        person.companyName,
        person.relationshipState,
        person.activeOpportunity,
        person.activeAsk,
        ...person.contactChannels.map((channel) => channel.value)
      ],
      filter
    )
  );
}

export function filterCrmCompaniesV1(
  companies: readonly CrmCompanyDirectoryRecordV1[],
  filter: CrmDirectoryFilterV1 = {}
): readonly CrmCompanyDirectoryRecordV1[] {
  return sortCrmCompaniesV1(companies).filter((company) =>
    matchesEvidence(company.evidenceState, filter) &&
    matchesQuery(
      [
        company.name,
        company.category,
        company.relationshipState,
        company.nextMove,
        company.supportedValue,
        ...company.keyPeople,
        ...company.activeOpportunities
      ],
      filter
    )
  );
}

export function buildCrmDirectoryIndexV1(input: CrmDirectoryIndexV1): CrmDirectoryIndexV1 {
  return {
    people: sortCrmPeopleV1(input.people),
    companies: sortCrmCompaniesV1(input.companies)
  };
}

/**
 * Production starts fail-closed until a canonical CRM loader supplies evidence-backed records.
 * Test fixtures belong in tests, not in this production projection.
 */
export const EMPTY_CRM_DIRECTORY_INDEX_V1: CrmDirectoryIndexV1 = Object.freeze({
  people: Object.freeze([]) as readonly CrmPersonDirectoryRecordV1[],
  companies: Object.freeze([]) as readonly CrmCompanyDirectoryRecordV1[]
});
