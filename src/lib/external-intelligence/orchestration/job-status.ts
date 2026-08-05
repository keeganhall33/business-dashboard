export type ExternalCollectionJobStatus =
  | "queued"
  | "leased"
  | "running"
  | "succeeded"
  | "no_output"
  | "retry_wait"
  | "blocked"
  | "failed"
  | "cancelled"
  | "stale";

export type FailureClass =
  | "transient_network"
  | "timeout"
  | "upstream_5xx"
  | "rate_limited"
  | "temporary_access_degradation"
  | "lease_expired"
  | "invalid_configuration"
  | "unsupported_adapter"
  | "terms_expired"
  | "access_revoked"
  | "credential_missing"
  | "licensing_blocked"
  | "legal_block"
  | "malformed_response"
  | "schema_mismatch"
  | "eligibility_revoked";
