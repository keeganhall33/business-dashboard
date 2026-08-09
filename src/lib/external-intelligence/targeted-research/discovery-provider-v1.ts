import type { DiscoveryResultV1 } from "@/lib/external-intelligence/targeted-research/targeted-research-contracts-v1";

export type ResearchDiscoveryProviderV1 = {
  kind: string;
  search: (input: { query: string; max_results: number }) => Promise<DiscoveryResultV1[]>;
};
