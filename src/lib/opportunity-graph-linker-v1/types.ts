export type OpportunityRowLite = {
  id: string;
  name: string;
  organization: string | null;
  notes_md?: string | null;
  source?: string | null;
};

export type ClaimVersionLite = {
  claim_id: string;
  content_hash: string;
  created_at?: string | null;
  payload_json: unknown;
};

export type LinkRole =
  | "SUPPORTS"
  | "TRIGGERED_BY"
  | "CONTEXT_FOR"
  | "ACCESS_PATH"
  | "VALUE_SIGNAL"
  | "TIMING_SIGNAL";

export type MatchMethod =
  | "explicit_id"
  | "entity_id"
  | "exact_org_name"
  | "alias_unambiguous";

export type GraphTargetType =
  | "claim_version"
  | "event_version"
  | "signal_version"
  | "evidence_reference_version"
  | "entity";

export type OpportunityGraphLinkDraft = {
  opportunity_id: string;
  target_type: GraphTargetType;
  target_id: string;
  target_content_hash?: string | null;
  role: LinkRole;
  match_method: MatchMethod;
  confidence: number; // 0..1
  explanation: string;
  metadata?: Record<string, unknown>;
};

