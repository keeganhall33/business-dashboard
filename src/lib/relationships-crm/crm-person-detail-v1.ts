import type {
  CrmDirectoryIndexV1,
  CrmPersonDirectoryRecordV1
} from "@/lib/relationships-crm/crm-directory-index-v1";

export type CrmPersonDetailV1 = {
  contractVersion: "crm_person_detail_v1";
  id: string;
  name: string | null;
  title: string | null;
  companyName: string | null;
  contactChannels: CrmPersonDirectoryRecordV1["contactChannels"];
  relationshipState: string | null;
  relationshipStrength: CrmPersonDirectoryRecordV1["relationshipStrength"];
  lastTouchAt: string | null;
  nextFollowUpAt: string | null;
  activeOpportunity: string | null;
  activeAsk: string | null;
  evidenceState: CrmPersonDirectoryRecordV1["evidenceState"];
  verificationRequired: boolean;
  recommendedNextMove: string;
};

function nonEmpty(value: string | null): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function dateOnly(value: string | null): string | null {
  if (!value) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? new Date(time).toISOString().slice(0, 10) : null;
}

function safeNextMove(person: CrmPersonDirectoryRecordV1): string {
  if (person.evidenceState !== "KNOWN") {
    return "Verify current relationship evidence before acting.";
  }
  if (nonEmpty(person.activeAsk)) {
    return "Review the active ask and relationship context before the next touch.";
  }
  if (dateOnly(person.nextFollowUpAt)) {
    return "Review the verified follow-up window before the next touch.";
  }
  if (nonEmpty(person.activeOpportunity)) {
    return "Review the linked opportunity before choosing the next relationship move.";
  }
  return "No supported next relationship move is available.";
}

export function buildCrmPersonDetailV1(person: CrmPersonDirectoryRecordV1): CrmPersonDetailV1 {
  if (person == null || typeof person !== "object" || Array.isArray(person)) {
    throw new Error("person must be an object");
  }
  if (typeof person.id !== "string" || !person.id.trim()) {
    throw new Error("person.id must be a non-empty string");
  }
  if (!Array.isArray(person.contactChannels)) {
    throw new Error("person.contactChannels must be an array");
  }

  return {
    contractVersion: "crm_person_detail_v1",
    id: person.id.trim(),
    name: nonEmpty(person.name),
    title: nonEmpty(person.title),
    companyName: nonEmpty(person.companyName),
    contactChannels: person.contactChannels.map((channel) => ({
      kind: channel.kind,
      value: nonEmpty(channel.value),
      evidenceState: channel.evidenceState
    })),
    relationshipState: nonEmpty(person.relationshipState),
    relationshipStrength: person.relationshipStrength,
    lastTouchAt: dateOnly(person.lastTouchAt),
    nextFollowUpAt: dateOnly(person.nextFollowUpAt),
    activeOpportunity: nonEmpty(person.activeOpportunity),
    activeAsk: nonEmpty(person.activeAsk),
    evidenceState: person.evidenceState,
    verificationRequired: person.evidenceState !== "KNOWN",
    recommendedNextMove: safeNextMove(person)
  };
}

export function resolveCrmPersonDetailV1(
  index: CrmDirectoryIndexV1,
  personId: string
): CrmPersonDetailV1 | null {
  if (index == null || typeof index !== "object" || Array.isArray(index)) {
    throw new Error("index must be an object");
  }
  if (typeof personId !== "string" || !personId.trim()) return null;
  const person = index.people.find((candidate) => candidate.id === personId.trim());
  return person ? buildCrmPersonDetailV1(person) : null;
}
