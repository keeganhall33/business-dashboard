export type CapabilityLifecycleStatusV1 =
  | "IMPLEMENTED_AND_PROVEN"
  | "IMPLEMENTED_NEEDS_HARDENING"
  | "PARTIAL"
  | "NOT_IMPLEMENTED"
  | "BLOCKED_HUMAN_ACTION"
  | "UNKNOWN";

export type RoadmapCapabilityRegistryEntryV1 = {
  capability_id: string;
  label: string;
  description: string;
  lifecycle_status?: CapabilityLifecycleStatusV1 | null;
};

export type CapabilityStatusChipViewModelV1 = {
  capability_id: string;
  label: string;
  description: string;
  lifecycle_status: CapabilityLifecycleStatusV1;
  chip_label: string;
  chip_tone: "zinc" | "emerald" | "amber" | "rose" | "sky";
};

export const ROADMAP_CAPABILITY_REGISTRY_V1: RoadmapCapabilityRegistryEntryV1[] = [
  {
    capability_id: "company_intelligence_search",
    label: "Company intelligence search",
    description: "Discover programs, partnerships, events, agencies, and opportunity context.",
    lifecycle_status: "PARTIAL"
  },
  {
    capability_id: "event_intelligence",
    label: "Event intelligence",
    description: "Map sponsors, activations, hospitality, agencies, and premium event ecosystems.",
    lifecycle_status: "PARTIAL"
  },
  {
    capability_id: "planning_cycle_intelligence",
    label: "Planning-cycle intelligence",
    description: "Track relationship windows, procurement timing, and ideal pitch windows.",
    lifecycle_status: "UNKNOWN"
  },
  {
    capability_id: "email_intelligence",
    label: "Email intelligence",
    description: "Read-only first-party relationship extraction, pending approved mailbox connection.",
    lifecycle_status: "BLOCKED_HUMAN_ACTION"
  }
];

const CHIP_COPY: Record<CapabilityLifecycleStatusV1, Pick<CapabilityStatusChipViewModelV1, "chip_label" | "chip_tone">> = {
  IMPLEMENTED_AND_PROVEN: { chip_label: "Implemented + proven", chip_tone: "emerald" },
  IMPLEMENTED_NEEDS_HARDENING: { chip_label: "Needs hardening", chip_tone: "amber" },
  PARTIAL: { chip_label: "Partial", chip_tone: "amber" },
  NOT_IMPLEMENTED: { chip_label: "Not implemented", chip_tone: "zinc" },
  BLOCKED_HUMAN_ACTION: { chip_label: "Blocked: human action", chip_tone: "sky" },
  UNKNOWN: { chip_label: "Unknown", chip_tone: "zinc" }
};

export function toCapabilityStatusViewModelV1(entry: RoadmapCapabilityRegistryEntryV1): CapabilityStatusChipViewModelV1 {
  const lifecycle_status = entry.lifecycle_status ?? "UNKNOWN";
  const chip = CHIP_COPY[lifecycle_status];

  return {
    capability_id: entry.capability_id,
    label: entry.label,
    description: entry.description,
    lifecycle_status,
    chip_label: chip.chip_label,
    chip_tone: chip.chip_tone
  };
}

export function getCapabilityRegistryViewModelsV1(
  entries: RoadmapCapabilityRegistryEntryV1[] = ROADMAP_CAPABILITY_REGISTRY_V1
): CapabilityStatusChipViewModelV1[] {
  return entries
    .map(toCapabilityStatusViewModelV1)
    .sort((a, b) => a.capability_id.localeCompare(b.capability_id));
}
