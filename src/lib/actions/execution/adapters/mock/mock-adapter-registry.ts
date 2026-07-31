import type { ExecutionAdapter, ExecutionAdapterId } from "@/lib/actions/execution/adapter-contract";
import type { AdapterRegistry } from "@/lib/actions/execution/execution-request-service";
import { getMockExecutionAdapter } from "@/lib/actions/execution/adapters/mock/mock-adapter";

export type Milestone12RegistryConfig = {
  enabledAdapters: ReadonlySet<ExecutionAdapterId>;
  enabledCategories: ReadonlySet<string>;
  emergencyStopActionIds: ReadonlySet<string>;
};

export function createMilestone12AdapterRegistry(config?: Partial<Milestone12RegistryConfig>): AdapterRegistry {
  // Deny-by-default.
  const enabledAdapters = config?.enabledAdapters ?? new Set<ExecutionAdapterId>(["mock"]);
  const enabledCategories = config?.enabledCategories ?? new Set<string>(["email", "ads", "store", "content", "ops"]);
  const emergencyStopActionIds = config?.emergencyStopActionIds ?? new Set<string>();

  const mock = getMockExecutionAdapter();
  const adapters: Record<ExecutionAdapterId, ExecutionAdapter> = {
    mock
  };

  return {
    getAdapter(id: ExecutionAdapterId): ExecutionAdapter | null {
      if (id !== "mock") return null;
      return adapters.mock;
    },
    isAdapterEnabled(id: ExecutionAdapterId): boolean {
      return enabledAdapters.has(id);
    },
    isCategoryEnabled(category: string): boolean {
      return enabledCategories.has(category);
    },
    isEmergencyStopEnabled(actionId: string): boolean {
      return emergencyStopActionIds.has(actionId);
    }
  };
}

export function milestone12RegisteredAdapterIds(): ExecutionAdapterId[] {
  return ["mock"];
}

