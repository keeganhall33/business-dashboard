import type { ExternalIntelligenceStore } from "@/lib/external-intelligence/persistence/interfaces";
import type { VersionRef } from "@/lib/external-intelligence/contracts/version-ref";
import { PersistenceNotFoundError } from "@/lib/external-intelligence/persistence/errors";

export async function reconstructByVersionRef(input: {
  store: ExternalIntelligenceStore;
  ref: VersionRef;
}): Promise<unknown> {
  switch (input.ref.object_type) {
    case "evidence_reference":
      return (await input.store.evidence.fetchVersion(input.ref)).payload;
    case "claim":
      return (await input.store.claims.fetchVersion(input.ref)).payload;
    case "signal":
      return (await input.store.signals.fetchVersion(input.ref)).payload;
    default:
      throw new PersistenceNotFoundError(`Unsupported object_type for reconstruction: ${input.ref.object_type}`);
  }
}

export async function verifyReconstructionCompleteness(input: {
  store: ExternalIntelligenceStore;
  required_refs: VersionRef[];
}): Promise<void> {
  // Fail closed: if any required version is missing, throw.
  for (const ref of input.required_refs) {
    await reconstructByVersionRef({ store: input.store, ref });
  }
}
