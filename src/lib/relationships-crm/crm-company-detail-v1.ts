import type {
  CrmCompanyDirectoryRecordV1,
  CrmDirectoryIndexV1
} from "@/lib/relationships-crm/crm-directory-index-v1";

export type CrmCompanyDetailV1 = {
  contractVersion: "crm_company_detail_v1";
  id: string;
  name: string | null;
  category: string | null;
  keyPeople: readonly string[];
  relationshipState: string | null;
  activeOpportunities: readonly string[];
  lastActivityAt: string | null;
  nextMove: string | null;
  supportedValue: string | null;
  evidenceState: CrmCompanyDirectoryRecordV1["evidenceState"];
  verificationRequired: boolean;
  recommendedNextMove: string;
};

function nonEmpty(value: string | null): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function cleanList(values: readonly string[]): readonly string[] {
  return values.map((value) => value.trim()).filter(Boolean);
}

function dateOnly(value: string | null): string | null {
  if (!value) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? new Date(time).toISOString().slice(0, 10) : null;
}

function safeNextMove(company: CrmCompanyDirectoryRecordV1): string {
  if (company.evidenceState !== "KNOWN") {
    return "Verify current company evidence before acting.";
  }
  const nextMove = nonEmpty(company.nextMove);
  if (nextMove) return nextMove;
  if (company.activeOpportunities.length) {
    return "Review the verified active opportunity context before choosing the next company move.";
  }
  return "No supported next company move is available.";
}

export function buildCrmCompanyDetailV1(company: CrmCompanyDirectoryRecordV1): CrmCompanyDetailV1 {
  if (company == null || typeof company !== "object" || Array.isArray(company)) {
    throw new Error("company must be an object");
  }
  if (typeof company.id !== "string" || !company.id.trim()) {
    throw new Error("company.id must be a non-empty string");
  }
  if (!Array.isArray(company.keyPeople)) {
    throw new Error("company.keyPeople must be an array");
  }
  if (!Array.isArray(company.activeOpportunities)) {
    throw new Error("company.activeOpportunities must be an array");
  }

  return {
    contractVersion: "crm_company_detail_v1",
    id: company.id.trim(),
    name: nonEmpty(company.name),
    category: nonEmpty(company.category),
    keyPeople: cleanList(company.keyPeople),
    relationshipState: nonEmpty(company.relationshipState),
    activeOpportunities: cleanList(company.activeOpportunities),
    lastActivityAt: dateOnly(company.lastActivityAt),
    nextMove: nonEmpty(company.nextMove),
    supportedValue: nonEmpty(company.supportedValue),
    evidenceState: company.evidenceState,
    verificationRequired: company.evidenceState !== "KNOWN",
    recommendedNextMove: safeNextMove(company)
  };
}

export function resolveCrmCompanyDetailV1(
  index: CrmDirectoryIndexV1,
  companyId: string
): CrmCompanyDetailV1 | null {
  if (index == null || typeof index !== "object" || Array.isArray(index)) {
    throw new Error("index must be an object");
  }
  if (typeof companyId !== "string" || !companyId.trim()) return null;
  const company = index.companies.find((candidate) => candidate.id === companyId.trim());
  return company ? buildCrmCompanyDetailV1(company) : null;
}
