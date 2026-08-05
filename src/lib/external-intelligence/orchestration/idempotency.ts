import { sha256CanonicalJson } from "@/lib/external-intelligence/hashing/content-hash";

export function createIdempotencyKey(input: {
  schedule_id: string;
  planned_for_iso: string;
  input_fingerprint: string;
}): string {
  return sha256CanonicalJson({ v: "collection-job-idempotency/v1", ...input });
}

export function createInputFingerprint(input: {
  source_id: string;
  source_config_version: string;
  registry_hash: string;
  source_sets_hash: string;
  eligibility_fingerprint: string;
  policy_version: string;
}): string {
  return sha256CanonicalJson({ v: "collection-job-input/v1", ...input });
}
