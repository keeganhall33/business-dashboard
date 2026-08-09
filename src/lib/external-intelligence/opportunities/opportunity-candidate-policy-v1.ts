import type { ExternalEventV1, EventVersionRefV1 } from "@/lib/external-intelligence/contracts/external-event-v1";

import {
  computeOpportunityCandidateIdV1,
  type DetectorClassificationV1,
  type FunctionalRelevanceV1,
  type OpportunityCandidateV1,
  type OpportunityReasonCodeV1
} from "@/lib/external-intelligence/opportunities/opportunity-candidate-v1";
import { mapAppointmentRoleToFunctionalRelevanceV1 } from "@/lib/external-intelligence/opportunities/functional-relevance-v1";

export const OPPORTUNITY_DETECTOR_POLICY_VERSION_V1 = "opportunity_candidate_v1.policy";

export type OpportunityDetectionAuditV1 = {
  event_id: string;
  event_type: string;
  classification: DetectorClassificationV1;
  reason_codes: OpportunityReasonCodeV1[];
};

function normalizeWhitespace(input: string): string {
  return input.replace(/\s+/g, " ").trim();
}

function snapshotEntityRef(ref: unknown): { entity_id: string; entity_type: string; canonical_name: string } {
  const r = ref as { entity_id?: unknown; entity_type?: unknown; canonical_name?: unknown };
  return {
    entity_id: String(r?.entity_id ?? ""),
    entity_type: String(r?.entity_type ?? ""),
    canonical_name: String(r?.canonical_name ?? "")
  };
}

function isHighRelevance(fn: FunctionalRelevanceV1): boolean {
  return (
    fn === "marketing" ||
    fn === "brand_marketing" ||
    fn === "partnerships" ||
    fn === "sponsorship_activation" ||
    fn === "experiential_events" ||
    fn === "creative_content" ||
    fn === "csr_philanthropy" ||
    fn === "licensing_merch"
  );
}

function relevantReasonCode(fn: FunctionalRelevanceV1): OpportunityReasonCodeV1 {
  switch (fn) {
    case "marketing":
      return "relevant_marketing_appointment";
    case "brand_marketing":
      return "relevant_brand_marketing_appointment";
    case "partnerships":
      return "relevant_partnerships_appointment";
    case "experiential_events":
      return "relevant_experiential_appointment";
    case "creative_content":
      return "relevant_creative_content_appointment";
    case "csr_philanthropy":
      return "relevant_csr_philanthropy_appointment";
    case "licensing_merch":
      return "relevant_licensing_merch_appointment";
    default:
      return "function_unresolved";
  }
}

function buildHypothesisV1(input: {
  focalName: string;
  contextName: string;
  functionalRelevance: FunctionalRelevanceV1;
  appointmentRole: string;
}): string {
  const role = normalizeWhitespace(input.appointmentRole);

  // Deterministic, calibrated language. No claims of lead certainty.
  const base = `${input.focalName} may now influence ${role} for ${input.contextName}`;

  const tailByFn: Record<FunctionalRelevanceV1, string> = {
    marketing: "and could become a relevant agency relationship for future marketing-adjacent art opportunities.",
    brand_marketing: "and could become a relevant agency relationship for future brand-led art opportunities.",
    partnerships: "and could become a relevant relationship for future partnership-driven opportunities.",
    sponsorship_activation: "and could become a relevant relationship for future sponsorship activation opportunities.",
    experiential_events: "and could become a relevant relationship for future event/activation-adjacent opportunities.",
    creative_content: "and could become a relevant agency relationship for future campaign or storytelling-adjacent art opportunities.",
    csr_philanthropy: "and could become a relevant relationship for future CSR/philanthropy-adjacent opportunities.",
    licensing_merch: "and could become a relevant relationship for future licensing/merchandise-adjacent opportunities.",
    finance_accounting: "",
    tax_audit: "",
    it_security: "",
    hr_ops: "",
    unknown: ""
  };

  const tail = tailByFn[input.functionalRelevance] ?? "";
  return normalizeWhitespace(`${base} ${tail}`);
}

export function detectOpportunityCandidatesFromEventV1(input: {
  event: ExternalEventV1;
  event_version_ref: Pick<EventVersionRefV1, "event_id" | "content_hash" | "schema_version" | "policy_version">;
  // In read-only mode we want to report rejections for audit.
  includeRejections?: boolean;
}): { candidates: OpportunityCandidateV1[]; audit: OpportunityDetectionAuditV1 } {
  const ev = input.event;

  // Partnership safety: no candidates in V1.
  if (ev.event_type === "partnership_formed") {
    const audit: OpportunityDetectionAuditV1 = {
      event_id: ev.event_id,
      event_type: ev.event_type,
      classification: "REJECTED_NO_OPPORTUNITY",
      reason_codes: ["partnership_requires_context"]
    };
    return { candidates: [], audit };
  }

  // Only supported trigger.
  if (ev.event_type !== "entity_appointed_to_role") {
    const audit: OpportunityDetectionAuditV1 = {
      event_id: ev.event_id,
      event_type: ev.event_type,
      classification: "REJECTED_NO_OPPORTUNITY",
      reason_codes: ["unsupported_event_type"]
    };
    return { candidates: [], audit };
  }

  const appointing = ev.participants.find((p) => p.role === "appointing_entity")?.entity_ref as unknown;
  const appointed = ev.participants.find((p) => p.role === "appointed_entity")?.entity_ref as unknown;

  const appointmentRoleRaw = ev.attributes.find((a) => a.key === "appointment_role")?.value ?? "";
  const appointment_role = normalizeWhitespace(String(appointmentRoleRaw));

  if (!appointment_role) {
    const audit: OpportunityDetectionAuditV1 = {
      event_id: ev.event_id,
      event_type: ev.event_type,
      classification: "REJECTED_NO_OPPORTUNITY",
      reason_codes: ["missing_appointment_role"]
    };
    return { candidates: [], audit };
  }

  const mapped = mapAppointmentRoleToFunctionalRelevanceV1(appointment_role);
  const fn = mapped.functional_relevance;

  if (fn === "unknown") {
    const audit: OpportunityDetectionAuditV1 = {
      event_id: ev.event_id,
      event_type: ev.event_type,
      classification: "REJECTED_NO_OPPORTUNITY",
      reason_codes: ["function_unresolved"]
    };
    return { candidates: [], audit };
  }

  if (!isHighRelevance(fn)) {
    const audit: OpportunityDetectionAuditV1 = {
      event_id: ev.event_id,
      event_type: ev.event_type,
      classification: "REJECTED_NO_OPPORTUNITY",
      reason_codes: ["irrelevant_function"]
    };
    return { candidates: [], audit };
  }

  // Entity role mapping: appointed_entity is focal; appointing_entity is context.
  const focal = snapshotEntityRef(appointed);
  const context = snapshotEntityRef(appointing);

  const opportunity_candidate_id = computeOpportunityCandidateIdV1({
    opportunity_type: "agency_relationship_signal",
    focal_entity_ids: [focal.entity_id],
    context_entity_ids: [context.entity_id],
    relevant_function: fn,
    event_id: ev.event_id
  });

  const candidate: OpportunityCandidateV1 = {
    opportunity_candidate_id,
    opportunity_type: "agency_relationship_signal",
    detector_classification: "PLAUSIBLE_NEEDS_CONTEXT",
    focal_entity_refs: [focal],
    context_entity_refs: [context],
    relevant_functions: [fn],
    hypothesis: buildHypothesisV1({
      focalName: focal.canonical_name,
      contextName: context.canonical_name,
      functionalRelevance: fn,
      appointmentRole: appointment_role
    }),
    reason_codes: [relevantReasonCode(fn)],
    derived_signals: [
      { key: "appointment_role", value: appointment_role },
      { key: "functional_relevance", value: fn },
      { key: "relationship_pattern", value: "agency_or_service_provider_appointment" }
    ],
    assumptions: [
      "The appointed agency/provider remit may expose it to initiatives where art/cultural activations could become relevant.",
      "The context organization may run campaigns/activations where Keegan’s work could fit, but this is not yet proven."
    ],
    missing_intelligence: [
      "organization_business_context",
      "agency_scope",
      "art_or_cultural_fit",
      "existing_relationship",
      "planning_window",
      "commercial_model_fit"
    ],
    trigger_event_version_refs: [
      {
        // Candidate stable identity uses event_id (not content_hash);
        // provenance pins to the exact Event version.
        event_id: input.event_version_ref.event_id,
        content_hash: input.event_version_ref.content_hash,
        schema_version: input.event_version_ref.schema_version,
        policy_version: input.event_version_ref.policy_version
      }
    ],
    detector_policy_version: OPPORTUNITY_DETECTOR_POLICY_VERSION_V1,
    detected_at: new Date().toISOString(),
    relevance_window: null
  };

  const audit: OpportunityDetectionAuditV1 = {
    event_id: ev.event_id,
    event_type: ev.event_type,
    classification: "PLAUSIBLE_NEEDS_CONTEXT",
    reason_codes: [relevantReasonCode(fn)]
  };

  return { candidates: [candidate], audit };
}
