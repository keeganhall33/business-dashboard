export type IndustryPulseContactStatus = "verified" | "suspected" | "unknown";

export type IndustryPulseOpportunity = {
  id: string;
  day: string; // YYYY-MM-DD (UTC)
  source: string;
  headline: string;
  summary: string;
  collabIdea: string;
  whyNow: string;
  contactName: string | null;
  contactEmail: string | null;
  contactConfidence: number | null; // 0..1
  contactStatus: IndustryPulseContactStatus;
  contactEmailSource?: string | null;
  sourceUrl: string | null;
};

export type IndustryPulseDaySnapshot = {
  day: string;
  refreshedAtIso: string;
  items: IndustryPulseOpportunity[];
};

export type IndustryPulseResponse = {
  ok: true;
  day: string;
  refreshedAtIso: string;
  items: IndustryPulseOpportunity[];
  availableDays: string[];
};

export type IndustryPulseInteractions = {
  ok: true;
  updatedAtIso: string;
  items: Record<
    string,
    {
      contactedAtIso?: string;
      addedToPipelineAtIso?: string;
      pipelineOpportunityId?: string;
      dismissedAtIso?: string;
    }
  >;
};
