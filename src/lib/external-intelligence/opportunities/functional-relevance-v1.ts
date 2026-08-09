import type { FunctionalRelevanceV1 } from "@/lib/external-intelligence/opportunities/opportunity-candidate-v1";

function normalize(input: string): string {
  return input.toLowerCase().replace(/\s+/g, " ").trim();
}

function includesAny(haystack: string, needles: string[]): boolean {
  return needles.some((n) => haystack.includes(n));
}

export type RoleMappingResultV1 = {
  functional_relevance: FunctionalRelevanceV1;
  reason: string;
};

/**
 * Deterministic precision-first mapping from appointment_role -> functional relevance.
 * - No LLM.
 * - Case-insensitive, whitespace-normalized.
 * - Prefer single-category mapping.
 */
export function mapAppointmentRoleToFunctionalRelevanceV1(rawRole: string): RoleMappingResultV1 {
  const role = normalize(rawRole);

  if (!role) return { functional_relevance: "unknown", reason: "empty_role" };

  // Explicit irrelevant buckets first.
  if (includesAny(role, ["tax", "audit", "auditor", "internal audit"])) {
    return { functional_relevance: "tax_audit", reason: "tax_or_audit_keywords" };
  }

  if (includesAny(role, ["accounting", "accountant", "bookkeeping", "controller", "finance" ])) {
    return { functional_relevance: "finance_accounting", reason: "finance_keywords" };
  }

  if (includesAny(role, ["it ", "it-", "security", "infosec", "cyber", "ciso"])) {
    return { functional_relevance: "it_security", reason: "it_security_keywords" };
  }

  if (includesAny(role, ["hr", "human resources", "recruit", "talent acquisition", "people ops"])) {
    return { functional_relevance: "hr_ops", reason: "hr_keywords" };
  }

  // High relevance.
  if (includesAny(role, ["experiential", "event", "events", "activation"])) {
    return { functional_relevance: "experiential_events", reason: "experiential_event_keywords" };
  }

  if (includesAny(role, ["partnership", "partnerships", "strategic partnership", "sponsorship"])) {
    // sponsorship may also imply activation, but keep single bucket in V1.
    return { functional_relevance: "partnerships", reason: "partnership_keywords" };
  }

  if (includesAny(role, ["philanthropy", "csr", "social impact", "foundation", "fundraising"])) {
    return { functional_relevance: "csr_philanthropy", reason: "philanthropy_keywords" };
  }

  if (includesAny(role, ["licensing", "merch", "merchandising"])) {
    return { functional_relevance: "licensing_merch", reason: "licensing_keywords" };
  }

  if (includesAny(role, ["content", "creative", "studio", "production", "storytelling"])) {
    return { functional_relevance: "creative_content", reason: "creative_content_keywords" };
  }

  if (includesAny(role, ["brand marketing"])) {
    return { functional_relevance: "brand_marketing", reason: "brand_marketing_phrase" };
  }

  if (includesAny(role, ["marketing", "digital marketing", "growth marketing"])) {
    return { functional_relevance: "marketing", reason: "marketing_keywords" };
  }

  if (includesAny(role, ["sponsorship activation"])) {
    return { functional_relevance: "sponsorship_activation", reason: "sponsorship_activation_phrase" };
  }

  return { functional_relevance: "unknown", reason: "no_match" };
}
