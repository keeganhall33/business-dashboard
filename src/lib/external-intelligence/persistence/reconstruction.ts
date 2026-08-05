import type { ExternalIntelligenceStore } from "@/lib/external-intelligence/persistence/interfaces";
import type { VersionRef } from "@/lib/external-intelligence/contracts/version-ref";
import { PersistenceNotFoundError } from "@/lib/external-intelligence/persistence/errors";

export type RedactedPayloadTombstone = {
  kind: "redacted_tombstone";
  object_type: VersionRef["object_type"];
  object_id: string;
  content_hash: string;
  redaction_reason: string | null;
  content_redacted_at: string | null;
};

function tombstoneFor(input: {
  ref: VersionRef;
  redaction_reason: string | null;
  content_redacted_at: string | null;
}): RedactedPayloadTombstone {
  return {
    kind: "redacted_tombstone",
    object_type: input.ref.object_type,
    object_id: input.ref.object_id,
    content_hash: input.ref.content_hash,
    redaction_reason: input.redaction_reason,
    content_redacted_at: input.content_redacted_at
  };
}

export async function reconstructByVersionRef(input: {
  store: ExternalIntelligenceStore;
  ref: VersionRef;
}): Promise<unknown | RedactedPayloadTombstone> {
  switch (input.ref.object_type) {
    case "evidence_reference":
      {
        const row = await input.store.evidence.fetchVersion(input.ref);
        if (!row.payload_available) {
          return tombstoneFor({ ref: input.ref, redaction_reason: row.redaction_reason, content_redacted_at: row.content_redacted_at });
        }
        return row.payload_json;
      }
    case "claim":
      {
        const row = await input.store.claims.fetchVersion(input.ref);
        if (!row.payload_available) {
          return tombstoneFor({ ref: input.ref, redaction_reason: row.redaction_reason, content_redacted_at: row.content_redacted_at });
        }
        return row.payload_json;
      }
    case "signal":
      {
        const row = await input.store.signals.fetchVersion(input.ref);
        if (!row.payload_available) {
          return tombstoneFor({ ref: input.ref, redaction_reason: row.redaction_reason, content_redacted_at: row.content_redacted_at });
        }
        return row.payload_json;
      }
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

export async function reconstructAtTime(input: {
  store: ExternalIntelligenceStore;
  object_type: VersionRef["object_type"];
  object_id: string;
  at: string; // ISO
}): Promise<unknown | RedactedPayloadTombstone> {
  const atMs = Date.parse(input.at);
  if (!Number.isFinite(atMs)) throw new PersistenceNotFoundError("invalid_argument");

  const pick = <T extends { effective_at: string | null; created_at: string; content_hash: string; schema_version: string }>(
    rows: T[]
  ) => {
    const eligible = rows
      .filter((r) => r.effective_at && Date.parse(r.effective_at) <= atMs)
      .sort((a, b) => {
        const ea = Date.parse(a.effective_at!);
        const eb = Date.parse(b.effective_at!);
        if (ea !== eb) return eb - ea;
        return Date.parse(b.created_at) - Date.parse(a.created_at);
      });
    return eligible[0] ?? null;
  };

  if (input.object_type === "evidence_reference") {
    const history = await input.store.evidence.listVersions(input.object_id);
    const chosen = pick(history);
    if (!chosen) throw new PersistenceNotFoundError("version_not_found");
    return reconstructByVersionRef({
      store: input.store,
      ref: {
        object_type: "evidence_reference",
        object_id: input.object_id,
        version_id: null,
        content_hash: chosen.content_hash,
        schema_version: chosen.schema_version,
        policy_version: "reconstruction/v1",
        created_at: chosen.created_at
      }
    });
  }

  if (input.object_type === "claim") {
    const history = await input.store.claims.listVersions(input.object_id);
    const chosen = pick(history);
    if (!chosen) throw new PersistenceNotFoundError("version_not_found");
    return reconstructByVersionRef({
      store: input.store,
      ref: {
        object_type: "claim",
        object_id: input.object_id,
        version_id: null,
        content_hash: chosen.content_hash,
        schema_version: chosen.schema_version,
        policy_version: "reconstruction/v1",
        created_at: chosen.created_at
      }
    });
  }

  if (input.object_type === "signal") {
    const history = await input.store.signals.listVersions(input.object_id);
    const chosen = pick(history);
    if (!chosen) throw new PersistenceNotFoundError("version_not_found");
    return reconstructByVersionRef({
      store: input.store,
      ref: {
        object_type: "signal",
        object_id: input.object_id,
        version_id: null,
        content_hash: chosen.content_hash,
        schema_version: chosen.schema_version,
        policy_version: "reconstruction/v1",
        created_at: chosen.created_at
      }
    });
  }

  throw new PersistenceNotFoundError("invalid_argument");
}
