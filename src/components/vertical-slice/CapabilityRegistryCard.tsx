import { StatusChip } from "@/components/dashboard/ui/StatusChip";
import {
  getCapabilityRegistryViewModelsV1,
  type RoadmapCapabilityRegistryEntryV1
} from "@/lib/intelligence/capabilities/capability-status-view-model";
import { VerticalSliceCard } from "./VerticalSliceCard";

type Props = {
  entries?: RoadmapCapabilityRegistryEntryV1[];
};

export function CapabilityRegistryCard({ entries }: Props) {
  const capabilities = getCapabilityRegistryViewModelsV1(entries);

  return (
    <VerticalSliceCard title="Capability registry" subtitle="Read-only readiness map for intelligence surfaces.">
      <div className="space-y-3">
        {capabilities.map((capability) => (
          <div
            key={capability.capability_id}
            className="flex flex-col gap-2 rounded-lg border border-white/10 bg-white/[0.02] p-3 sm:flex-row sm:items-start sm:justify-between"
          >
            <div className="min-w-0 space-y-1">
              <div className="text-sm font-semibold text-zinc-100">{capability.label}</div>
              <div className="text-xs leading-5 text-zinc-400">{capability.description}</div>
            </div>
            <div className="shrink-0">
              <StatusChip label={capability.chip_label} tone={capability.chip_tone} />
            </div>
          </div>
        ))}
      </div>
    </VerticalSliceCard>
  );
}
