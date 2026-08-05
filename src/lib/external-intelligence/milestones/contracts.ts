import { z } from "zod";

import { deepFreeze } from "@/lib/external-intelligence/config/freeze";
import { sha256CanonicalJson } from "@/lib/external-intelligence/hashing/content-hash";

export const MilestoneSchemaVersion = "sports_milestone_v1" as const;

export const MilestoneTypeSchema = z.enum([
  "championship_anniversary",
  "franchise_anniversary",
  "inaugural_season",
  "player_debut_anniversary",
  "retirement_anniversary",
  "hall_of_fame_anniversary_or_eligibility",
  "jersey_retirement_event",
  "historic_game_anniversary",
  "record_setting_achievement",
  "award_anniversary",
  "stadium_arena_anniversary",
  "rivalry_anniversary",
  "major_team_or_league_event",
  "sports_history_catalyst_publication"
]);

export const ConfidenceSchema = z.enum(["low", "medium", "high"]);
export const ReviewStatusSchema = z.enum(["unreviewed", "reviewed", "blocked"]);
export const CorrectionStatusSchema = z.enum(["none", "corrected", "retracted"]);

export const SubjectEntityRefSchema = z
  .object({
    entity_type: z.enum(["team", "league", "athlete", "coach", "stadium", "event", "organization"]),
    entity_id: z.string().min(1).max(128),
    label: z.string().min(1).max(160)
  })
  .strict();

export const EvidenceRefSchema = z
  .object({
    label: z.string().min(1).max(120),
    url: z.string().url(),
    note: z.string().min(1).max(240).optional()
  })
  .strict();

export const SportsMilestoneSchema = z
  .object({
    schema_version: z.literal(MilestoneSchemaVersion),

    milestone_id: z.string().min(3).max(128),
    milestone_type: MilestoneTypeSchema,

    subject_entities: z.array(SubjectEntityRefSchema).min(1),

    team: z.string().min(1).max(64).nullable(),
    league: z.string().min(1).max(32),
    geographic_market: z.string().min(1).max(64),

    original_event_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
    milestone_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    anniversary_number: z.number().int().min(0).max(200).nullable(),
    season_or_year: z.string().min(1).max(16),

    championship_or_achievement_type: z.string().min(1).max(120).nullable(),

    historical_significance: z.enum(["low", "medium", "high"]),
    fan_collector_relevance: z.enum(["low", "medium", "high"]),
    partnership_potential: z.enum(["low", "medium", "high"]),

    licensing_rights_considerations: z.array(z.string().min(1).max(200)).default([]),

    evidence_refs: z.array(EvidenceRefSchema).min(1),
    source_ids: z.array(z.string().min(3).max(128)).min(1),

    confidence: ConfidenceSchema,

    correction_status: CorrectionStatusSchema,
    review_status: ReviewStatusSchema,

    content_hash: z.string().min(64).max(64)
  })
  .strict();

export type SportsMilestone = z.infer<typeof SportsMilestoneSchema>;

export const SportsMilestoneCalendarSchema = z
  .object({
    schema_version: z.literal("sports_milestone_calendar_v1"),
    calendar_version: z.string().min(1).max(64),
    fixture_status: z.enum(["test_only", "production"]).default("test_only"),
    milestones: z.array(SportsMilestoneSchema).min(1),
    calendar_content_hash: z.string().min(64).max(64)
  })
  .strict();

export type SportsMilestoneCalendar = z.infer<typeof SportsMilestoneCalendarSchema>;

export function computeMilestoneContentHash(m: Omit<SportsMilestone, "content_hash">): string {
  return sha256CanonicalJson({ v: "sports-milestone/v1", ...m });
}

export function parseSportsMilestone(json: unknown): SportsMilestone {
  const parsed = SportsMilestoneSchema.parse(json);
  const { content_hash, ...rest } = parsed;
  const expected = computeMilestoneContentHash(rest);
  if (content_hash !== expected) throw new Error(`milestone_content_hash_mismatch:${parsed.milestone_id}`);

  // Deterministic ordering.
  parsed.subject_entities = parsed.subject_entities
    .slice()
    .sort((a, b) => `${a.entity_type}:${a.entity_id}`.localeCompare(`${b.entity_type}:${b.entity_id}`));
  parsed.evidence_refs = parsed.evidence_refs.slice().sort((a, b) => a.url.localeCompare(b.url));
  parsed.source_ids = [...new Set(parsed.source_ids)].sort((a, b) => a.localeCompare(b));
  parsed.licensing_rights_considerations = [...new Set(parsed.licensing_rights_considerations)].sort((a, b) => a.localeCompare(b));

  return deepFreeze(parsed);
}

export function computeMilestoneCalendarHash(calendar: Omit<SportsMilestoneCalendar, "calendar_content_hash">): string {
  return sha256CanonicalJson({ v: "sports-milestone-calendar/v1", ...calendar });
}

export function parseSportsMilestoneCalendar(json: unknown): SportsMilestoneCalendar {
  const parsed = SportsMilestoneCalendarSchema.parse(json);

  parsed.milestones = parsed.milestones
    .map((m) => parseSportsMilestone(m))
    .slice()
    .sort((a, b) => a.milestone_date.localeCompare(b.milestone_date) || a.milestone_id.localeCompare(b.milestone_id));

  const { calendar_content_hash, ...rest } = parsed;
  const expected = computeMilestoneCalendarHash(rest);
  if (calendar_content_hash !== expected) throw new Error("milestone_calendar_hash_mismatch");

  return deepFreeze(parsed);
}
