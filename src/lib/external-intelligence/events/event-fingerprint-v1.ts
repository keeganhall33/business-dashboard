import type { ExternalEventV1 } from "@/lib/external-intelligence/contracts/external-event-v1";
import { computeContentHash } from "@/lib/external-intelligence/contracts/version-ref";

/**
 * Event fingerprint projection (V1): excludes volatile fields.
 *
 * Excludes:
 * - times.retrieved_at (may drift between replays)
 * - any read-time entity-resolution overlays (not stored in payload)
 */
export function projectEventForFingerprintV1(event: ExternalEventV1): unknown {
  return {
    schema_version: event.schema_version,
    event_id: event.event_id,
    event_type: event.event_type,
    participants: event.participants,
    attributes: event.attributes,
    times: {
      announcement_time: event.times.announcement_time,
      event_time: event.times.event_time,
      effective_from: event.times.effective_from,
      effective_until: event.times.effective_until
    },
    verification_state: event.verification_state,
    extraction_confidence: event.extraction_confidence,
    policy_version: event.policy_version
  };
}

export function computeEventContentHashV1(event: ExternalEventV1): string {
  return computeContentHash(projectEventForFingerprintV1(event));
}

export function computeEventFingerprintV1(event: ExternalEventV1): string {
  // Fingerprint is a stable hash of the semantic projection.
  return computeContentHash(projectEventForFingerprintV1(event));
}
